import { db } from "@repo/database";

/**
 * Generate a sequential account number for a customer within an organization.
 * Format: ACC-00001, ACC-00002, etc.
 *
 * Uses numeric extraction instead of string sorting to avoid
 * lexicographic issues (e.g. "ACC-1" sorting after "ACC-00050").
 */
export async function generateAccountNumber(
	organizationId: string,
): Promise<string> {
	const customers = await db.customer.findMany({
		where: { organizationId },
		select: { accountNumber: true },
	});

	let maxNumber = 0;
	for (const cust of customers) {
		const match = cust.accountNumber.match(/ACC-(\d+)/);
		if (match?.[1]) {
			const num = Number.parseInt(match[1], 10);
			if (num > maxNumber) {
				maxNumber = num;
			}
		}
	}

	return `ACC-${String(maxNumber + 1).padStart(5, "0")}`;
}
