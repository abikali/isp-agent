import { db } from "@repo/database";

/**
 * Generate a sequential employee number for an employee within an organization.
 * Format: EMP-00001, EMP-00002, etc.
 *
 * Uses numeric extraction instead of string sorting to avoid
 * lexicographic issues (e.g. "EMP-1" sorting after "EMP-00050").
 */
export async function generateEmployeeNumber(
	organizationId: string,
): Promise<string> {
	const employees = await db.employee.findMany({
		where: { organizationId },
		select: { employeeNumber: true },
	});

	let maxNumber = 0;
	for (const emp of employees) {
		const match = emp.employeeNumber.match(/EMP-(\d+)/);
		if (match?.[1]) {
			const num = Number.parseInt(match[1], 10);
			if (num > maxNumber) {
				maxNumber = num;
			}
		}
	}

	return `EMP-${String(maxNumber + 1).padStart(5, "0")}`;
}
