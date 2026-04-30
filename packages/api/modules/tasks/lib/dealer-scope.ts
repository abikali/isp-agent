/**
 * Dealer scoping for tasks.
 *
 * A task is in scope when its customer belongs to the active dealer; for
 * customer-less tasks an assigned employee on the active dealer counts
 * instead. When no dealer is active the org has no scoped data, so both
 * helpers reject everything — keeping list/get/update/delete consistent.
 */

interface TaskDealerShape {
	customerId: string | null;
	customer?: { dealerId: string | null } | null;
	assignments: Array<{ employee: { dealerId: string | null } }>;
}

export function taskInDealerScope(
	task: TaskDealerShape,
	activeDealerId: string | null,
): boolean {
	if (!activeDealerId) {
		return false;
	}
	if (task.customerId) {
		return task.customer?.dealerId === activeDealerId;
	}
	return task.assignments.some((a) => a.employee.dealerId === activeDealerId);
}

export function taskDealerScopeWhere(activeDealerId: string | null) {
	if (!activeDealerId) {
		return { id: { in: [] as string[] } };
	}
	return {
		OR: [
			{ customer: { dealerId: activeDealerId } },
			{
				customerId: null,
				assignments: {
					some: { employee: { dealerId: activeDealerId } },
				},
			},
		],
	};
}
