import { db } from "@repo/database";
import { phoneSearchVariants } from "@repo/utils";

export interface ContactCustomerMatch {
	id: string;
	status: string;
}

/**
 * The single customer of ANY status whose phone matches the chat contact, or
 * null when none or several match.
 *
 * Unlike `resolveVerifiedCustomerId` (ACTIVE only, which is what unlocks the
 * account tools), this never verifies anyone. It answers "is this number
 * already on file?" — a PENDING or stopped subscriber writing in is not an
 * unknown contact, and the team still wants to see who it is.
 */
export async function resolveContactCustomer(
	organizationId: string,
	contactId: string,
): Promise<ContactCustomerMatch | null> {
	const variants = phoneSearchVariants(contactId);
	if (variants.length === 0) {
		return null;
	}
	const matches = await db.customer.findMany({
		where: {
			organizationId,
			OR: [
				{ mobile: { in: variants } },
				...variants.map((v) => ({
					phones: { array_contains: [{ number: v }] },
				})),
			],
		},
		select: { id: true, status: true },
		take: 2,
	});
	return matches.length === 1 ? (matches[0] ?? null) : null;
}
