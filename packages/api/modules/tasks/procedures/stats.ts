import { requirePermission } from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { uninstalledItemDealerScope } from "./uninstalled-items";

export const getTaskStats = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks/stats",
		tags: ["Tasks"],
		summary: "Get task dashboard statistics",
	})
	.input(
		z.object({
			organizationId: z.string(),
			sources: z
				.array(z.enum(["MANUAL", "AI_ESCALATION", "LEGACY", "SYSTEM"]))
				.optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { organizationId } = input;
		const { activeDealerId } = await requirePermission(
			organizationId,
			user.id,
			"tasks",
			"read",
		);

		return cachedStat(
			statCacheKey("tasks/stats", [
				organizationId,
				activeDealerId,
				input.sources,
			]),
			async () => {
				const base: Record<string, unknown> = { organizationId };
				if (input.sources) {
					base["source"] = { in: input.sources };
				}

				// Dealer scoping: only count tasks belonging to the active dealer
				if (activeDealerId) {
					base["OR"] = [
						{ customer: { dealerId: activeDealerId } },
						{
							customerId: null,
							assignments: {
								some: {
									employee: { dealerId: activeDealerId },
								},
							},
						},
					];
				} else {
					// No dealer assigned — count nothing
					base["id"] = { in: [] as string[] };
				}

				const [
					statusCounts,
					overdue,
					unassigned,
					returned,
					pendingRecoveredItems,
				] = await Promise.all([
					db.task.groupBy({
						by: ["status"],
						where: base,
						_count: true,
					}),
					db.task.count({
						where: {
							...base,
							dueDate: { lt: new Date() },
							status: "OPEN",
						},
					}),
					db.task.count({
						where: {
							...base,
							assignments: { none: {} },
							status: "OPEN",
						},
					}),
					// Completions an approver sent back — see isReturned().
					db.task.count({
						where: {
							...base,
							status: "OPEN",
							completedAt: null,
							completedByEmployeeId: { not: null },
						},
					}),
					// Recovered equipment waiting on an approver. Drives the
					// sidebar badge so the review card on the tasks page
					// isn't the only place it surfaces.
					db.uninstalledItem.count({
						where: {
							organizationId,
							status: "PENDING",
							AND: [uninstalledItemDealerScope(activeDealerId)],
						},
					}),
				]);

				const countByStatus = new Map(
					statusCounts.map((s) => [s.status, s._count]),
				);
				const open = countByStatus.get("OPEN") ?? 0;
				const pendingApproval =
					countByStatus.get("PENDING_APPROVAL") ?? 0;
				const completed = countByStatus.get("COMPLETED") ?? 0;
				const cancelled = countByStatus.get("CANCELLED") ?? 0;

				return {
					total: open + pendingApproval + completed + cancelled,
					open,
					pendingApproval,
					completed,
					cancelled,
					overdue,
					unassigned,
					returned,
					pendingRecoveredItems,
				};
			},
		);
	});
