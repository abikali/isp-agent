import { renderTemplate, SMS_TEMPLATES } from "@repo/sms";
import { beirutParts, parsePhone } from "@repo/utils";

/**
 * Shared pieces of the customer payment notifications — the day-before-expiry
 * reminder (#31, daily cron) and the pending-stop notice (#32, manual button).
 * Both write one `CustomerNotification` row per channel and are delivered by
 * the `customer-notify` worker.
 */

export type CustomerNotificationKind = "expiry_reminder" | "stop_notice";
export type CustomerNotificationChannel = "whatsapp" | "sms";

export const WHATSAPP_TEMPLATES: Record<CustomerNotificationKind, string> = {
	expiry_reminder: "payment_reminder_tomorrow",
	stop_notice: "stop_request_notice",
};

/**
 * Sending costs the operator money (Salti + GlobeSMS), so a dealer org only
 * sends once the wholesale operator grants it. The operator org is never
 * "granted" by anyone and is implicitly allowed.
 */
export function customerNotificationsAllowed(org: {
	isWholesaleOperator: boolean;
	expiryReminderAllowed: boolean;
}): boolean {
	return org.isWholesaleOperator || org.expiryReminderAllowed;
}

/**
 * A phone as a Lebanese reader writes it: `76 878 870`, `03 775 126`,
 * `01 234 567`. Foreign numbers stay in E.164. Null for anything
 * libphonenumber can't validate, so junk never lands in a customer message.
 */
export function formatLocalPhone(
	raw: string | null | undefined,
): string | null {
	const parsed = parsePhone(raw?.trim());
	if (!parsed) {
		return null;
	}
	if (parsed.country !== "LB") {
		return parsed.e164;
	}
	const n = parsed.national;
	if (n.length === 8) {
		return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
	}
	if (n.length === 7) {
		return `0${n.slice(0, 1)} ${n.slice(1, 4)} ${n.slice(4)}`;
	}
	return parsed.domestic;
}

/**
 * The number put in the text for the customer to call — the first candidate
 * that parses, in the caller's priority order:
 *   1. the collector's `Employee.phone` (live iRadius value, refreshed each sync)
 *   2. `Customer.collectorPhone` (per-customer snapshot, same source)
 *   3. the org's office fallback (`Organization.reminderFallbackPhone`)
 *   4. the dealer owner (`IspDealer.whatsappPhone`, then `companyMobile`)
 * Null means "skip": never send a text with an empty number in it.
 */
export function pickContactPhone(
	candidates: Array<string | null | undefined>,
): string | null {
	for (const candidate of candidates) {
		const formatted = formatLocalPhone(candidate);
		if (formatted) {
			return formatted;
		}
	}
	return null;
}

/** Candidate list for tiers 3–4, shared by both kinds. */
export function orgContactCandidates(org: {
	reminderFallbackPhone: string | null;
	activeDealer: {
		whatsappPhone: string | null;
		companyMobile: string | null;
	} | null;
}): Array<string | null | undefined> {
	return [
		org.reminderFallbackPhone,
		org.activeDealer?.whatsappPhone,
		org.activeDealer?.companyMobile,
	];
}

/** `(1/10/2026)` — the Beirut calendar date of an expiry, for {{1}}. */
export function expiryLabel(expiryDate: Date): string {
	const { day, month, year } = beirutParts(expiryDate);
	return `(${day}/${month}/${year})`;
}

/** A `CustomerNotification` row to insert (plain types, usable in API responses). */
export interface NotificationRowData {
	organizationId: string;
	customerId: string;
	invoiceId: string | null;
	paymentId: string | null;
	kind: CustomerNotificationKind;
	channel: CustomerNotificationChannel;
	phone: string;
	contactPhone: string | null;
	templateName: string;
	body: string;
	status: "queued" | "skipped";
	error: string | null;
	sentById: string | null;
}

interface NotificationRowInput {
	organizationId: string;
	customerId: string;
	kind: CustomerNotificationKind;
	channels: CustomerNotificationChannel[];
	/** Raw customer phone; parsed here. */
	customerPhone: string | null;
	/** Formatted collector/office number, or null when none was found. */
	contactPhone: string | null;
	invoiceId?: string | null;
	paymentId?: string | null;
	/** Expiry reminders only: the {{1}} date label. */
	expiryLabel?: string | null;
	sentById?: string | null;
	/** Pre-decided skip (e.g. opted out). Wins over every other check. */
	skipReason?: string | null;
}

/**
 * One `CustomerNotification` row per channel — `queued` when it can be sent,
 * `skipped` with the reason when it can't (no contact number, invalid or
 * foreign phone for SMS, opted out). Skipped rows are kept so staff can see
 * why a customer got nothing, and so a re-run doesn't retry them.
 */
export function buildNotificationRows(
	input: NotificationRowInput,
): NotificationRowData[] {
	const parsed = parsePhone(input.customerPhone?.trim());
	return input.channels.map((channel) => {
		const templateName =
			channel === "whatsapp"
				? WHATSAPP_TEMPLATES[input.kind]
				: input.kind;
		const body =
			channel === "whatsapp"
				? JSON.stringify(
						input.kind === "expiry_reminder"
							? [
									input.expiryLabel ?? "",
									input.contactPhone ?? "",
								]
							: [input.contactPhone ?? ""],
					)
				: renderTemplate(SMS_TEMPLATES[input.kind], {
						phone: input.contactPhone,
					});

		let skip = input.skipReason ?? null;
		if (!skip && !parsed) {
			skip = "no valid customer phone";
		}
		if (!skip && !input.contactPhone) {
			skip = "no contact phone";
		}
		// GlobeSMS is a Lebanese route; foreign numbers get WhatsApp only.
		if (!skip && channel === "sms" && parsed?.country !== "LB") {
			skip = "not a Lebanese number (WhatsApp only)";
		}

		return {
			organizationId: input.organizationId,
			customerId: input.customerId,
			invoiceId: input.invoiceId ?? null,
			paymentId: input.paymentId ?? null,
			kind: input.kind,
			channel,
			phone: parsed?.digits ?? input.customerPhone?.trim() ?? "",
			contactPhone: input.contactPhone,
			templateName,
			body,
			status: skip ? "skipped" : "queued",
			error: skip,
			sentById: input.sentById ?? null,
		};
	});
}
