import {
	coverageKey,
	db,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
} from "@repo/database";
import { logger } from "@repo/logs";
import { sendSms } from "@repo/sms";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { getWorkerConcurrency } from "../lib/worker-concurrency";
import {
	sendWhatsAppExpiryReminder,
	sendWhatsAppStopNotice,
} from "../lib/wpbox";
import {
	CUSTOMER_NOTIFY_MAX_ATTEMPTS,
	CUSTOMER_NOTIFY_QUEUE_NAME,
} from "../queues/customer-notify.queue";
import type { CustomerNotifyJobData, CustomerNotifyJobResult } from "../types";

interface SendOutcome {
	ok: boolean;
	retriable: boolean;
	error: string | null;
	messageId: string | null;
}

interface NotificationRow {
	id: string;
	kind: string;
	channel: string;
	phone: string;
	body: string | null;
	contactPhone: string | null;
	invoice: {
		organizationId: string;
		customerId: string;
		year: number;
		month: number;
		total: number;
		totalWithTax: number;
		voidedAt: Date | null;
	} | null;
	payment: { reviewedAt: Date | null } | null;
}

/** WhatsApp template params are stored JSON-encoded in `body`. */
function waParams(body: string | null): string[] {
	try {
		const parsed: unknown = JSON.parse(body ?? "[]");
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

/**
 * Why a queued row must not go out any more: the invoice got paid or voided
 * between the 10:00 claim and the send, or the stop was reviewed in between.
 */
async function staleReason(row: NotificationRow): Promise<string | null> {
	if (row.kind === "stop_notice") {
		return row.payment && row.payment.reviewedAt === null
			? null
			: "already reviewed";
	}
	const inv = row.invoice;
	if (!inv) {
		return "invoice deleted";
	}
	if (inv.voidedAt) {
		return "invoice voided";
	}
	const month = await db.billingMonth.findUnique({
		where: {
			organizationId_year_month: {
				organizationId: inv.organizationId,
				year: inv.year,
				month: inv.month,
			},
		},
		select: { id: true },
	});
	if (!month) {
		return null;
	}
	const coverage = await fetchCoverageMap(
		db,
		inv.organizationId,
		[month.id],
		[inv.customerId],
	);
	const remaining = monthRemaining(
		invoiceAmount(inv),
		coverage.get(coverageKey(inv.customerId, month.id)),
	);
	return remaining > 0 ? null : "paid before send";
}

async function send(row: NotificationRow): Promise<SendOutcome> {
	if (row.channel === "sms") {
		const result = await sendSms({ to: row.phone, body: row.body ?? "" });
		return {
			ok: result.success,
			retriable: result.retriable ?? false,
			error: result.success ? null : (result.error ?? result.raw),
			messageId: result.providerMessageId ?? null,
		};
	}
	const params = waParams(row.body);
	const result =
		row.kind === "stop_notice"
			? await sendWhatsAppStopNotice({
					phone: row.phone,
					contactPhone: params[0] ?? row.contactPhone ?? "",
					notificationId: row.id,
				})
			: await sendWhatsAppExpiryReminder({
					phone: row.phone,
					expiryLabel: params[0] ?? "",
					contactPhone: params[1] ?? row.contactPhone ?? "",
					notificationId: row.id,
				});
	return result.ok
		? {
				ok: true,
				retriable: false,
				error: null,
				messageId: result.messageId,
			}
		: {
				ok: false,
				retriable: result.retriable,
				error: result.status
					? `${result.status}: ${result.error}`
					: result.error,
				messageId: null,
			};
}

/**
 * Deliver one `CustomerNotification` row. Mirrors the receipt worker:
 * permanent failure → `failed` and stop; transient → throw to retry, but
 * write `failed` only on the last attempt; success → `sent`. A failed log
 * write after a successful send never rethrows, or BullMQ would retry and
 * message the customer twice.
 */
export async function processCustomerNotification(
	notificationId: string,
	job: { attemptsMade: number; opts: { attempts?: number | undefined } },
): Promise<CustomerNotifyJobResult> {
	const row = await db.customerNotification.findUnique({
		where: { id: notificationId },
		select: {
			id: true,
			kind: true,
			channel: true,
			phone: true,
			body: true,
			contactPhone: true,
			status: true,
			invoice: {
				select: {
					organizationId: true,
					customerId: true,
					year: true,
					month: true,
					total: true,
					totalWithTax: true,
					voidedAt: true,
				},
			},
			payment: { select: { reviewedAt: true } },
		},
	});
	if (!row || row.status !== "queued") {
		return { status: "skipped" };
	}

	const stale = await staleReason(row);
	if (stale) {
		await db.customerNotification.update({
			where: { id: row.id },
			data: { status: "skipped", error: stale },
		});
		return { status: "skipped" };
	}

	const outcome = await send(row);
	const attempts = job.attemptsMade + 1;

	if (!outcome.ok) {
		const maxAttempts = job.opts.attempts ?? CUSTOMER_NOTIFY_MAX_ATTEMPTS;
		if (outcome.retriable && attempts < maxAttempts) {
			await db.customerNotification.update({
				where: { id: row.id },
				data: { attempts, error: outcome.error },
			});
			throw new Error(
				`Customer notify retry: ${outcome.error} (${row.channel} ${row.phone})`,
			);
		}
		await db.customerNotification.update({
			where: { id: row.id },
			data: {
				status: "failed",
				attempts,
				error: outcome.retriable
					? `${outcome.error} after ${attempts} attempts`
					: outcome.error,
			},
		});
		return { status: "failed" };
	}

	try {
		await db.customerNotification.update({
			where: { id: row.id },
			data: {
				status: "sent",
				attempts,
				sentAt: new Date(),
				providerMessageId: outcome.messageId,
				error: null,
			},
		});
	} catch (error) {
		logger.error("[Customer Notify] Sent but failed to log", {
			notificationId: row.id,
			error: String(error),
		});
	}
	return { status: "sent" };
}

export function createCustomerNotifyWorker(): Worker<
	CustomerNotifyJobData,
	CustomerNotifyJobResult
> {
	return new Worker<CustomerNotifyJobData, CustomerNotifyJobResult>(
		CUSTOMER_NOTIFY_QUEUE_NAME,
		(job) => processCustomerNotification(job.data.notificationId, job),
		{
			connection: getRedisConnection(),
			concurrency: getWorkerConcurrency(
				"CUSTOMER_NOTIFY_WORKER_CONCURRENCY",
				3,
			),
		},
	);
}
