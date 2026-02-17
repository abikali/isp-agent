import { db } from "@repo/database";

/**
 * Generate a sequential account number for a customer within an organization.
 * Format: ACC-00001, ACC-00002, etc.
 */
export async function generateAccountNumber(
	organizationId: string,
): Promise<string> {
	const lastCustomer = await db.customer.findFirst({
		where: { organizationId },
		orderBy: { accountNumber: "desc" },
		select: { accountNumber: true },
	});

	let nextNumber = 1;
	if (lastCustomer) {
		const match = lastCustomer.accountNumber.match(/ACC-(\d+)/);
		if (match?.[1]) {
			nextNumber = Number.parseInt(match[1], 10) + 1;
		}
	}

	return `ACC-${String(nextNumber).padStart(5, "0")}`;
}
