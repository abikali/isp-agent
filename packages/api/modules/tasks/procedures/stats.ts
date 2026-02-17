import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const member = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const [
			total,
			open,
			inProgress,
			onHold,
			completed,
			cancelled,
			overdue,
			unassigned,
		] = await Promise.all([
			db.task.count({ where: { organizationId } }),
			db.task.count({
				where: { organizationId, status: "OPEN" },
			}),
			db.task.count({
				where: { organizationId, status: "IN_PROGRESS" },
			}),
			db.task.count({
				where: { organizationId, status: "ON_HOLD" },
			}),
			db.task.count({
				where: { organizationId, status: "COMPLETED" },
			}),
			db.task.count({
				where: { organizationId, status: "CANCELLED" },
			}),
			db.task.count({
				where: {
					organizationId,
					dueDate: { lt: new Date() },
					status: { notIn: ["COMPLETED", "CANCELLED"] },
				},
			}),
			db.task.count({
				where: {
					organizationId,
					assignments: { none: {} },
					status: { notIn: ["COMPLETED", "CANCELLED"] },
				},
			}),
		]);

		return {
			total,
			open,
			inProgress,
			onHold,
			completed,
			cancelled,
			overdue,
			unassigned,
		};
	});
