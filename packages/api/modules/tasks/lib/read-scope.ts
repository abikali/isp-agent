import {
	getActionScope,
	getUserEmployeeId,
	type PermissionContext,
} from "../../../lib/permission";

/**
 * Own-scope clause for reading tasks: tasks the user created, or tasks
 * assigned to the user's employee record. `null` when the role reads all
 * tasks. Combine it through `AND` — it carries its own `OR`.
 */
export async function taskOwnScopeWhere(permCtx: PermissionContext) {
	if (getActionScope(permCtx, "tasks", "read") !== "own") {
		return null;
	}
	const empId = await getUserEmployeeId(
		permCtx.organizationId,
		permCtx.userId,
	);
	return {
		OR: [
			{ createdById: permCtx.userId },
			...(empId
				? [{ assignments: { some: { employeeId: empId } } }]
				: []),
		],
	};
}
