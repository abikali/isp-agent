import { db } from "@repo/database";

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
 */
export async function resolveVerifiedCustomerId(
	organizationId: string,
	contactId: string,
): Promise<string | null> {
	const variants = phoneVariants(contactId);
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

function phoneVariants(contactId: string): string[] {
	const digits = contactId.replace(/\D/g, "");
	if (!digits) {
		return [];
	}
	const set = new Set<string>([digits, `+${digits}`]);
	if (digits.startsWith("961") && digits.length > 3) {
		set.add(`0${digits.slice(3)}`);
	}
	return Array.from(set);
}
