import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { phoneSearchVariants } from "@repo/utils";

export interface LinkConversationCustomerInput {
	organizationId: string;
	conversationId: string;
	contactPhone: string | undefined;
	/** The iRadius `userName` the tool resolved to one subscriber. */
	userName: string;
	/** The ISP result came from the contact's own phone (`getVerifiedIspCustomer`). */
	phoneBacked: boolean;
}

function phoneMatches(
	customer: { mobile: string | null; phones: unknown },
	variants: string[],
): boolean {
	if (customer.mobile && variants.includes(customer.mobile)) {
		return true;
	}
	return (
		Array.isArray(customer.phones) &&
		customer.phones.some(
			(p) =>
				typeof p === "object" &&
				p !== null &&
				variants.includes(String((p as { number?: unknown }).number)),
		)
	);
}

/**
 * Remember which account the customer is talking about, so later turns (and
 * `isp-list-invoices`) use it — e.g. after they pick "home" out of three
 * accounts on one phone.
 *
 * Links only when the account is tied to the contact's phone: the ISP lookup
 * itself was by that phone (`phoneBacked`), or the local customer lists it.
 * Never on a username alone — `verifiedCustomerId` unlocks the invoices tool,
 * and a stranger must not verify by typing someone else's username.
 *
 * Returns the linked customer id, or null when nothing was linked.
 */
export async function linkConversationCustomer(
	input: LinkConversationCustomerInput,
): Promise<string | null> {
	const candidates = await db.customer.findMany({
		where: {
			organizationId: input.organizationId,
			username: input.userName,
			deletedAt: null,
		},
		select: { id: true, status: true, mobile: true, phones: true },
		orderBy: { createdAt: "desc" },
	});
	const customer =
		candidates.find((c) => c.status === "ACTIVE") ?? candidates[0];
	if (!customer) {
		return null;
	}

	const variants = input.contactPhone
		? phoneSearchVariants(input.contactPhone)
		: [];
	const source = input.phoneBacked
		? "isp-phone-match"
		: phoneMatches(customer, variants)
			? "local-phone-match"
			: null;
	if (!source) {
		return null;
	}

	const updated = await db.aiConversation.updateMany({
		where: {
			id: input.conversationId,
			OR: [
				{ verifiedCustomerId: null },
				{ verifiedCustomerId: { not: customer.id } },
			],
		},
		data: { verifiedCustomerId: customer.id },
	});
	if (updated.count > 0) {
		logger.info("ai-conversation-customer-linked", {
			conversationId: input.conversationId,
			customerId: customer.id,
			source,
		});
	}
	return customer.id;
}
