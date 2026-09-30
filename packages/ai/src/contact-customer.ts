import { db } from "@repo/database";
import { phoneSearchVariants } from "@repo/utils";

export interface ContactCustomerMatch {
	id: string;
	status: string;
	username: string | null;
}

/**
 * Every customer of ANY status (not deleted) whose phone matches the chat
 * contact, up to `take`.
 *
 * Unlike `resolveVerifiedCustomerId` (ACTIVE only, which is what unlocks the
 * account tools), this never verifies anyone. It answers "is this number
 * already on file?" — a PENDING or stopped subscriber, or a phone shared by
 * several accounts, is not an unknown contact.
 */
export async function findContactCustomers(
	organizationId: string,
	contactId: string,
	take = 10,
): Promise<ContactCustomerMatch[]> {
	const variants = phoneSearchVariants(contactId);
	if (variants.length === 0) {
		return [];
	}
	return db.customer.findMany({
		where: {
			organizationId,
			deletedAt: null,
			OR: [
				{ mobile: { in: variants } },
				...variants.map((v) => ({
					phones: { array_contains: [{ number: v }] },
				})),
			],
		},
		select: { id: true, status: true, username: true },
		take,
	});
}

/**
 * The single customer whose phone matches the chat contact, or null when none
 * or several match — for linking something (a task) to exactly one account.
 */
export async function resolveContactCustomer(
	organizationId: string,
	contactId: string,
): Promise<ContactCustomerMatch | null> {
	const matches = await findContactCustomers(organizationId, contactId, 2);
	return matches.length === 1 ? (matches[0] ?? null) : null;
}
