import { db } from "@repo/database";
import { phoneSearchVariants } from "@repo/utils";

/**
 * Resolve an AI conversation contact to a single ISP customer by phone.
 *
 * `contactId` is the digit-only phone we get from the messaging provider
 * (e.g. WhatsApp gives `9613035468`). Customer phones are stored in a few
 * historical formats (`+9613035468`, `9613035468`, `03035468`), so we match
 * against all common variants of `mobile` plus the `phones` JSON array.
 *
 * Returns the customer id only if exactly one ACTIVE customer in the org
 * matches. Multiple matches (e.g. shared family phone) → null, so the agent
 * falls back to its normal "ask which account" flow rather than guessing.
 *
 * Country handling is uniform — libphonenumber-js parses Lebanese, Syrian,
 * any other country code without us hand-rolling per-country branches.
 */
export async function resolveVerifiedCustomerId(
	organizationId: string,
	contactId: string,
): Promise<string | null> {
	const variants = phoneSearchVariants(contactId);
	if (variants.length === 0) {
		return null;
	}

	const phonesContains = variants.map(
		(v) => ({ phones: { array_contains: [{ number: v }] } }) as const,
	);

	const matches = await db.customer.findMany({
		where: {
			organizationId,
			status: "ACTIVE",
			OR: [{ mobile: { in: variants } }, ...phonesContains],
		},
		select: { id: true },
		take: 2,
	});

	if (matches.length === 1) {
		return matches[0]?.id ?? null;
	}
	return null;
}
