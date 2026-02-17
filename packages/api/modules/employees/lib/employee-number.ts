import { db } from "@repo/database";

/**
 * Generate a sequential employee number for an employee within an organization.
 * Format: EMP-00001, EMP-00002, etc.
 */
export async function generateEmployeeNumber(
	organizationId: string,
): Promise<string> {
	const lastEmployee = await db.employee.findFirst({
		where: { organizationId },
		orderBy: { employeeNumber: "desc" },
		select: { employeeNumber: true },
	});

	let nextNumber = 1;
	if (lastEmployee) {
		const match = lastEmployee.employeeNumber.match(/EMP-(\d+)/);
		if (match?.[1]) {
			nextNumber = Number.parseInt(match[1], 10) + 1;
		}
	}

	return `EMP-${String(nextNumber).padStart(5, "0")}`;
}
