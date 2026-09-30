import { db } from "@repo/database";
import type { VerifiedCustomerSummary } from "./build-system-prompt";
import { findContactCustomers } from "./contact-customer";

/**
 * The VERIFIED CUSTOMER prompt facts for a linked conversation: identity,
 * the plan and the price this subscriber actually pays, and the other
 * accounts registered on the same phone (so the bot asks which one when the
 * customer talks about another location). Shared by the webhook and the
 * retry worker so both prompts say the same thing.
 */
export async function loadVerifiedCustomerSummary(input: {
	organizationId: string;
	customerId: string;
	contactPhone: string | null | undefined;
}): Promise<VerifiedCustomerSummary | undefined> {
	const customer = await db.customer.findUnique({
		where: { id: input.customerId },
		select: {
			firstName: true,
			lastName: true,
			username: true,
			accountNumber: true,
			status: true,
			monthlyRate: true,
			plan: { select: { name: true, monthlyPrice: true } },
		},
	});
	if (!customer) {
		return undefined;
	}
	const sharing = input.contactPhone
		? await findContactCustomers(input.organizationId, input.contactPhone)
		: [];
	const otherAccounts = sharing
		.filter((c) => c.id !== input.customerId && c.username)
		.map((c) => c.username as string);
	const price = customer.monthlyRate ?? customer.plan?.monthlyPrice ?? null;
	return {
		fullName:
			[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
			undefined,
		username: customer.username ?? undefined,
		accountNumber: customer.accountNumber ?? undefined,
		status: customer.status,
		planName: customer.plan?.name ?? undefined,
		monthlyPriceUsd: price ?? undefined,
		otherAccounts: otherAccounts.length > 0 ? otherAccounts : undefined,
	};
}
