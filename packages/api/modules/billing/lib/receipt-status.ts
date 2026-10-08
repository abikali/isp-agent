import { customerWhatsAppPhone } from "@repo/database/phones";

/**
 * WhatsApp receipt state for a payment row, shared by the payments list
 * filter (server), the Receipt badge (client) and the resend procedures.
 *
 * Browser-safe: no Prisma client import. The web app imports it through the
 * `@repo/api/modules/billing/lib/receipt-status` package export so the badge
 * and the filter can't drift apart again.
 */

export type ReceiptStatus = "sent" | "failed" | "pending";

/** Worker-written send actions (auto from create-payment, manual resend). */
const RECEIPT_SEND_ACTIONS = ["whatsapp_receipt", "whatsapp_receipt_manual"];
const RECEIPT_FAILURE_STATUSES = ["failed", "skipped"];

/** Bulk resend never reaches back further than this. */
export const RECEIPT_RESEND_MAX_AGE_DAYS = 60;
/** Same window the single resend enforces. */
export const RECEIPT_RESEND_COOLDOWN_MS = 60_000;

export interface ReceiptLogEntry {
	action?: unknown;
	status?: unknown;
	error?: unknown;
	timestamp?: unknown;
}

interface ReceiptStateInput {
	receiptSent: boolean;
	stoppedAccount: boolean;
	debtAccount: boolean;
	activityLog: unknown;
}

/** Newest receipt-related entry (send attempts and "marked sent"). */
export function lastReceiptEntry(activityLog: unknown): ReceiptLogEntry | null {
	if (!Array.isArray(activityLog)) {
		return null;
	}
	for (let i = activityLog.length - 1; i >= 0; i--) {
		const entry = activityLog[i] as ReceiptLogEntry | null;
		if (
			entry &&
			typeof entry.action === "string" &&
			entry.action.startsWith("whatsapp_receipt")
		) {
			return entry;
		}
	}
	return null;
}

/**
 * Receipt status as the payments table shows it. `null` for rows that never
 * get a receipt (stopped accounts, debt visits). A worker "skipped" result
 * (bad phone, missing token) is a failure from the operator's point of view.
 */
export function getReceiptStatus(
	payment: ReceiptStateInput,
): ReceiptStatus | null {
	if (payment.stoppedAccount || payment.debtAccount) {
		return null;
	}
	if (payment.receiptSent) {
		return "sent";
	}
	const last = lastReceiptEntry(payment.activityLog);
	return typeof last?.status === "string" &&
		RECEIPT_FAILURE_STATUSES.includes(last.status)
		? "failed"
		: "pending";
}

/**
 * Prisma `where` fragment for `getReceiptStatus(...) === status`.
 *
 * Only a successful send (or "mark as sent") flips `receiptSent`, so on an
 * unsent row every receipt entry is a failure/skip — "has any failed entry"
 * is therefore the same as "last receipt entry failed", which is what the
 * badge reads. Returned as `AND` items so callers can append them without
 * clobbering an existing `OR`.
 */
export function receiptStatusWhere(status: ReceiptStatus): {
	receiptSent: boolean;
	stoppedAccount?: false;
	debtAccount?: false;
	AND?: Record<string, unknown>[];
} {
	if (status === "sent") {
		return { receiptSent: true };
	}
	const hasFailedEntry = {
		OR: RECEIPT_SEND_ACTIONS.flatMap((action) =>
			RECEIPT_FAILURE_STATUSES.map((entryStatus) => ({
				activityLog: {
					array_contains: [{ action, status: entryStatus }],
				},
			})),
		),
	};
	return {
		receiptSent: false,
		stoppedAccount: false,
		debtAccount: false,
		// activityLog is non-nullable, so NOT here can't drop NULL rows.
		AND: [status === "failed" ? hasFailedEntry : { NOT: hasFailedEntry }],
	};
}

export type ReceiptResendSkipReason =
	| "not_found"
	| "stopped"
	| "debt"
	| "already_sent"
	| "legacy"
	| "too_old"
	| "no_phone"
	| "rate_limited";

export const RECEIPT_RESEND_SKIP_LABELS: Record<
	ReceiptResendSkipReason,
	string
> = {
	not_found: "not found",
	stopped: "stopped account",
	debt: "debt visit",
	already_sent: "already sent",
	legacy: "legacy billing record",
	// Bulk only — the row's "Send Receipt" still works for these.
	too_old: `older than ${RECEIPT_RESEND_MAX_AGE_DAYS} days (send from the row menu)`,
	no_phone: "no phone on file",
	rate_limited: "sent under a minute ago",
};

export interface ReceiptResendCandidate extends ReceiptStateInput {
	externalBillingId: number | null;
	paidAt: Date | string;
	customer: {
		phones: unknown;
		mobile: string | null;
		phone: string | null;
	};
}

export type ReceiptResendDecision =
	| { action: "queue"; phone: string }
	| { action: "skip"; reason: ReceiptResendSkipReason };

/**
 * Decide whether a bulk "Resend receipts" may queue this payment.
 *
 * Legacy rows (imported from the old billing app) and anything older than
 * the age window are refused so a broad selection can never blast the
 * thousands of historical "pending" rows. Setup-approval payments have no
 * auto receipt but pass here like any recent row with a phone.
 */
export function classifyReceiptResend(
	payment: ReceiptResendCandidate | null | undefined,
	now: Date,
): ReceiptResendDecision {
	if (!payment) {
		return { action: "skip", reason: "not_found" };
	}
	if (payment.stoppedAccount) {
		return { action: "skip", reason: "stopped" };
	}
	if (payment.debtAccount) {
		return { action: "skip", reason: "debt" };
	}
	if (payment.receiptSent) {
		return { action: "skip", reason: "already_sent" };
	}
	if (payment.externalBillingId !== null) {
		return { action: "skip", reason: "legacy" };
	}
	const ageMs = now.getTime() - new Date(payment.paidAt).getTime();
	if (ageMs > RECEIPT_RESEND_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
		return { action: "skip", reason: "too_old" };
	}
	const phone = receiptPhone(payment.customer);
	if (!phone) {
		return { action: "skip", reason: "no_phone" };
	}
	if (isReceiptCoolingDown(payment.activityLog, now)) {
		return { action: "skip", reason: "rate_limited" };
	}
	return { action: "queue", phone };
}

/** Where the receipt goes — see `customerWhatsAppPhone` (never a landline). */
export function receiptPhone(customer: {
	phones: unknown;
	mobile: string | null;
	phone: string | null;
}): string | null {
	return customerWhatsAppPhone(customer);
}

export function isReceiptCoolingDown(activityLog: unknown, now: Date): boolean {
	const last = lastReceiptEntry(activityLog);
	if (typeof last?.timestamp !== "string") {
		return false;
	}
	return (
		now.getTime() - new Date(last.timestamp).getTime() <
		RECEIPT_RESEND_COOLDOWN_MS
	);
}
