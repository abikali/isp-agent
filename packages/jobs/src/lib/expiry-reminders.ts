import {
	BILLABLE_CUSTOMER_STATUSES,
	coverageKey,
	customerWhatsAppPhone,
	db,
	excludeGroupFilter,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
	PENDING_STOPPED_PAYMENT,
} from "@repo/database";
import { logger } from "@repo/logs";
import { beirutDayAt, parsePhone, tgEscape } from "@repo/utils";
import { queueCustomerNotifications } from "../jobs/customer-notify.jobs";
import { queueTelegramNotify } from "../jobs/telegram-notify.jobs";
import {
	buildNotificationRows,
	type CustomerNotificationChannel,
	customerNotificationsAllowed,
	expiryLabel,
	type NotificationRowData,
	orgContactCandidates,
	pickContactPhone,
} from "./customer-notifications";

/**
 * Day-before-expiry payment reminders (#31). Every day at 10:00 Beirut, each
 * org that has reminders allowed + enabled messages the customers whose
 * invoice expires tomorrow and is still unpaid, on WhatsApp and/or SMS, with
 * their collector's number to call.
 *
 * "Unpaid" follows the billing rules exactly: the invoice is the unit of
 * truth (its frozen `expiryDate`, never the live `Customer.expiresAt`), and a
 * month is settled by amount per (customer, billing month) — settlement.ts.
 */

type DbClient = typeof db;

/**
 * The UTC instants bounding tomorrow's Beirut calendar day. DST-safe (Beirut
 * falls back on the last Sunday of October), so never a hardcoded +3.
 */
export function beirutTomorrowWindow(now: Date): { gte: Date; lt: Date } {
	return {
		gte: beirutDayAt(now, 1, "00:00"),
		lt: beirutDayAt(now, 2, "00:00"),
	};
}

/**
 * Billing months up to and including the active one (latest unlocked). The
 * cron never opens a month: no unlocked month → nothing to remind about.
 */
async function relevantBillingMonths(client: DbClient, organizationId: string) {
	const months = await client.billingMonth.findMany({
		where: { organizationId },
		select: { id: true, year: true, month: true, locked: true },
		orderBy: [{ year: "asc" }, { month: "asc" }],
	});
	const unlocked = months.filter((m) => !m.locked);
	const active = unlocked[unlocked.length - 1];
	if (!active) {
		return [];
	}
	const cap = active.year * 12 + active.month;
	return months.filter((m) => m.year * 12 + m.month <= cap);
}

export interface ReminderOrg {
	id: string;
	activeDealerId: string | null;
	reminderFallbackPhone: string | null;
	activeDealer: {
		whatsappPhone: string | null;
		companyMobile: string | null;
	} | null;
}

export interface DueReminder {
	invoiceId: string;
	customerId: string;
	customerPhone: string | null;
	contactPhone: string | null;
	expiryLabel: string;
	/** Set when the customer must not be messaged (opted out, no contact number). */
	skipReason: string | null;
}

/**
 * Invoices expiring tomorrow (Beirut) that still have money owed, with the
 * phone to message and the number to put in the text.
 */
export async function findDueReminders(
	org: ReminderOrg,
	now: Date,
	client: DbClient = db,
): Promise<DueReminder[]> {
	const months = await relevantBillingMonths(client, org.id);
	if (months.length === 0) {
		return [];
	}
	const monthIds = months.map((m) => m.id);
	const monthIdByYM = new Map(
		months.map((m) => [`${m.year}-${m.month}`, m.id]),
	);

	// Mirrors list-unpaid.ts: billable, not deleted, same dealer scope, not the
	// free group, and not in stop-review limbo.
	const invoices = await client.customerInvoice.findMany({
		where: {
			organizationId: org.id,
			voidedAt: null,
			expiryDate: beirutTomorrowWindow(now),
			OR: months.map((m) => ({ year: m.year, month: m.month })),
			customer: {
				deletedAt: null,
				status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
				dealerId: org.activeDealerId ?? null,
				AND: [excludeGroupFilter("free")],
				NOT: {
					payments: {
						some: {
							billingMonthId: { in: monthIds },
							...PENDING_STOPPED_PAYMENT,
						},
					},
				},
			},
		},
		select: {
			id: true,
			customerId: true,
			year: true,
			month: true,
			total: true,
			totalWithTax: true,
			expiryDate: true,
			customer: {
				select: {
					phones: true,
					mobile: true,
					phone: true,
					collectorPhone: true,
					collector: { select: { name: true, phone: true } },
				},
			},
		},
	});
	if (invoices.length === 0) {
		return [];
	}

	const coverage = await fetchCoverageMap(client, org.id, monthIds, [
		...new Set(invoices.map((inv) => inv.customerId)),
	]);
	const suppressed = new Set(
		(
			await client.marketingSuppression.findMany({
				where: { organizationId: org.id },
				select: { phone: true },
			})
		).map((s) => s.phone),
	);
	const orgCandidates = orgContactCandidates(org);

	const due: DueReminder[] = [];
	for (const inv of invoices) {
		const billingMonthId = monthIdByYM.get(`${inv.year}-${inv.month}`);
		if (!billingMonthId || !inv.expiryDate) {
			continue;
		}
		const remaining = monthRemaining(
			invoiceAmount(inv),
			coverage.get(coverageKey(inv.customerId, billingMonthId)),
		);
		if (remaining <= 0) {
			continue;
		}
		const { customer } = inv;
		const customerPhone = customerWhatsAppPhone(customer);
		const contactPhone = pickContactPhone([
			customer.collector?.phone,
			customer.collectorPhone,
			...orgCandidates,
		]);
		const digits = parsePhone(customerPhone)?.digits;

		let skipReason: string | null = null;
		if (digits && suppressed.has(digits)) {
			skipReason = "opted out";
		} else if (!contactPhone) {
			skipReason = customer.collector
				? `no contact phone (collector: ${customer.collector.name})`
				: "no contact phone (no collector)";
		}

		due.push({
			invoiceId: inv.id,
			customerId: inv.customerId,
			customerPhone,
			contactPhone,
			expiryLabel: expiryLabel(inv.expiryDate),
			skipReason,
		});
	}
	return due;
}

/** Channels an org has switched on for reminders. */
export function reminderChannels(org: {
	expiryReminderWhatsapp: boolean;
	expiryReminderSms: boolean;
}): CustomerNotificationChannel[] {
	return [
		...(org.expiryReminderWhatsapp ? (["whatsapp"] as const) : []),
		...(org.expiryReminderSms ? (["sms"] as const) : []),
	];
}

/**
 * Claim and queue one org's reminders. The unique (invoiceId, kind, channel)
 * plus `skipDuplicates` makes re-runs and manual re-triggers idempotent: an
 * invoice is reminded at most once per channel, ever.
 */
export async function claimOrgReminders(
	org: ReminderOrg & {
		expiryReminderWhatsapp: boolean;
		expiryReminderSms: boolean;
	},
	now: Date,
	client: DbClient = db,
): Promise<{ claimed: number; queued: string[] }> {
	const channels = reminderChannels(org);
	if (channels.length === 0) {
		return { claimed: 0, queued: [] };
	}
	const due = await findDueReminders(org, now, client);
	if (due.length === 0) {
		return { claimed: 0, queued: [] };
	}
	const rows: NotificationRowData[] = due.flatMap((r) =>
		buildNotificationRows({
			organizationId: org.id,
			customerId: r.customerId,
			invoiceId: r.invoiceId,
			kind: "expiry_reminder",
			channels,
			customerPhone: r.customerPhone,
			contactPhone: r.contactPhone,
			expiryLabel: r.expiryLabel,
			skipReason: r.skipReason,
		}),
	);
	const { count } = await client.customerNotification.createMany({
		data: rows,
		skipDuplicates: true,
	});
	// Every still-queued row for these invoices: the ones just inserted, plus
	// any an earlier run claimed but never got onto the queue. The job id is
	// the row id and the worker re-checks `status`, so re-queueing is safe.
	const queued = await client.customerNotification.findMany({
		where: {
			organizationId: org.id,
			kind: "expiry_reminder",
			status: "queued",
			invoiceId: { in: due.map((r) => r.invoiceId) },
		},
		select: { id: true },
	});
	return { claimed: count, queued: queued.map((r) => r.id) };
}

/** Daily cron entry point. Returns how many notifications were queued. */
export async function runExpiryReminders(now = new Date()): Promise<number> {
	const orgs = await db.organization.findMany({
		where: {
			expiryReminderEnabled: true,
			OR: [
				{ expiryReminderAllowed: true },
				{ isWholesaleOperator: true },
			],
		},
		select: {
			id: true,
			slug: true,
			isWholesaleOperator: true,
			expiryReminderAllowed: true,
			expiryReminderWhatsapp: true,
			expiryReminderSms: true,
			activeDealerId: true,
			reminderFallbackPhone: true,
			activeDealer: {
				select: { whatsappPhone: true, companyMobile: true },
			},
		},
	});

	let total = 0;
	for (const org of orgs) {
		if (!customerNotificationsAllowed(org)) {
			continue;
		}
		try {
			const { claimed, queued } = await claimOrgReminders(org, now);
			await queueCustomerNotifications(queued);
			total += queued.length;
			logger.info("[Expiry Reminders] Org run", {
				organizationId: org.id,
				slug: org.slug,
				claimed,
				queued: queued.length,
			});
		} catch (error) {
			logger.error("[Expiry Reminders] Org run failed", {
				organizationId: org.id,
				error: String(error),
			});
		}
	}
	return total;
}

/**
 * An hour after the run (retries are done by then), tell the org's admin
 * Telegram chat when most of today's reminders failed — typically GlobeSMS
 * credit ran out (`ERR:` fails every row) or a Salti template was rejected.
 */
export async function reportExpiryReminderFailures(
	now = new Date(),
): Promise<number> {
	const since = new Date(now.getTime() - 6 * 60 * 60 * 1000);
	const groups = await db.customerNotification.groupBy({
		by: ["organizationId", "channel", "status"],
		where: { kind: "expiry_reminder", createdAt: { gte: since } },
		_count: { _all: true },
	});
	const byOrg = new Map<
		string,
		{ sent: number; failed: number; errors: string[] }
	>();
	for (const g of groups) {
		const entry = byOrg.get(g.organizationId) ?? {
			sent: 0,
			failed: 0,
			errors: [],
		};
		if (g.status === "sent") {
			entry.sent += g._count._all;
		} else if (g.status === "failed") {
			entry.failed += g._count._all;
			entry.errors.push(`${g.channel} ×${g._count._all}`);
		}
		byOrg.set(g.organizationId, entry);
	}

	let alerted = 0;
	for (const [organizationId, stats] of byOrg) {
		const attempted = stats.sent + stats.failed;
		if (attempted === 0 || stats.failed / attempted <= 0.5) {
			continue;
		}
		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { adminTelegramChatId: true },
		});
		const chatId = org?.adminTelegramChatId?.trim();
		if (!chatId) {
			continue;
		}
		const sample = await db.customerNotification.findFirst({
			where: {
				organizationId,
				kind: "expiry_reminder",
				status: "failed",
				createdAt: { gte: since },
			},
			select: { error: true },
			orderBy: { updatedAt: "desc" },
		});
		await queueTelegramNotify({
			organizationId,
			chatId,
			parseMode: "HTML",
			text: [
				"<b>⚠️ Payment reminders mostly failed today</b>",
				`${stats.failed} failed, ${stats.sent} sent (${stats.errors.join(", ")}).`,
				sample?.error
					? `Last error: ${tgEscape(sample.error.slice(0, 200))}`
					: "",
				"Check SMS credit / WhatsApp templates.",
			]
				.filter(Boolean)
				.join("\n"),
		});
		alerted++;
	}
	return alerted;
}
