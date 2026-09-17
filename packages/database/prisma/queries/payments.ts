import { db } from "../client";

export interface PaymentActivityEntry {
	action: string;
	status: "success" | "failed" | "skipped";
	statusCode?: number | undefined;
	error?: string | undefined;
	detail?: string | undefined;
	timestamp: string;
}

/**
 * Append entries to `Payment.activityLog` in a single SQL statement
 * (`jsonb || jsonb`), so concurrent writers — createPayment's creation entry
 * and the WhatsApp receipt worker — can't drop each other's entries the way a
 * read-modify-write does. `markReceiptSent` flips the receipt flags in the
 * same statement.
 */
export async function appendPaymentActivityLog(
	paymentIds: string[],
	entries: PaymentActivityEntry | PaymentActivityEntry[],
	options: { markReceiptSent?: boolean } = {},
): Promise<number> {
	if (paymentIds.length === 0) {
		return 0;
	}
	const payload = JSON.stringify(
		Array.isArray(entries) ? entries : [entries],
	);
	if (options.markReceiptSent) {
		return db.$executeRaw`
			UPDATE "payment" SET
				"activityLog" = COALESCE("activityLog", '[]'::jsonb) || ${payload}::jsonb,
				"receiptSent" = true,
				"receiptSentAt" = NOW(),
				"updatedAt" = NOW()
			WHERE "id" = ANY(${paymentIds}::text[])
		`;
	}
	return db.$executeRaw`
		UPDATE "payment" SET
			"activityLog" = COALESCE("activityLog", '[]'::jsonb) || ${payload}::jsonb,
			"updatedAt" = NOW()
		WHERE "id" = ANY(${paymentIds}::text[])
	`;
}
