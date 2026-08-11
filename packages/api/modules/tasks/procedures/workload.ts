import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getWorkloadByEmployee = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks/workload",
		tags: ["Tasks"],
		summary: "Per-worker open task workload and recent completions",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"read",
		);

		const dealerScope = getDealerScopeFilter(activeDealerId);
		const assignments = await db.taskAssignment.findMany({
			where: {
				employee: dealerScope,
				task: {
					organizationId: input.organizationId,
					status: "OPEN",
					source: { in: ["MANUAL", "LEGACY"] },
				},
			},
			select: {
				assignedAt: true,
				employee: { select: { id: true, name: true } },
				task: { select: { category: true } },
			},
		});

		const startOfMonth = new Date();
		startOfMonth.setDate(1);
		startOfMonth.setHours(0, 0, 0, 0);

		const completed = await db.task.groupBy({
			by: ["completedByEmployeeId"],
			where: {
				organizationId: input.organizationId,
				status: "COMPLETED",
				completedAt: { gte: startOfMonth },
				completedByEmployeeId: { not: null },
				completedByEmployee: dealerScope,
			},
			_count: true,
		});
		const completedMap = new Map(
			completed.map((c) => [c.completedByEmployeeId, c._count]),
		);

		const byEmployee = new Map<
			string,
			{
				employeeId: string;
				name: string;
				openCount: number;
				uninstallCount: number;
				maintenanceCount: number;
				oldestAssignedAt: Date | null;
				completedThisMonth: number;
			}
		>();

		for (const a of assignments) {
			const entry = byEmployee.get(a.employee.id) ?? {
				employeeId: a.employee.id,
				name: a.employee.name,
				openCount: 0,
				uninstallCount: 0,
				maintenanceCount: 0,
				oldestAssignedAt: null,
				completedThisMonth: completedMap.get(a.employee.id) ?? 0,
			};
			entry.openCount += 1;
			if (a.task.category === "UNINSTALL") {
				entry.uninstallCount += 1;
			}
			if (
				a.task.category === "MAINTENANCE" ||
				a.task.category === "REPAIR"
			) {
				entry.maintenanceCount += 1;
			}
			if (
				!entry.oldestAssignedAt ||
				a.assignedAt < entry.oldestAssignedAt
			) {
				entry.oldestAssignedAt = a.assignedAt;
			}
			byEmployee.set(a.employee.id, entry);
		}

		// Include workers with completions this month but no open tasks
		for (const [employeeId, count] of completedMap) {
			if (employeeId && !byEmployee.has(employeeId)) {
				const emp = await db.employee.findFirst({
					where: {
						id: employeeId,
						organizationId: input.organizationId,
						...dealerScope,
					},
					select: { name: true },
				});
				if (emp) {
					byEmployee.set(employeeId, {
						employeeId,
						name: emp.name,
						openCount: 0,
						uninstallCount: 0,
						maintenanceCount: 0,
						oldestAssignedAt: null,
						completedThisMonth: count,
					});
				}
			}
		}

		return {
			workers: [...byEmployee.values()].sort(
				(a, b) => b.openCount - a.openCount,
			),
		};
	});
