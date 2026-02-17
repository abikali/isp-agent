import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateTask = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/update",
		tags: ["Tasks"],
		summary: "Update a task",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			title: z.string().min(1).max(500).optional(),
			description: z.string().max(5000).nullable().optional(),
			priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
			status: z
				.enum([
					"OPEN",
					"IN_PROGRESS",
					"ON_HOLD",
					"COMPLETED",
					"CANCELLED",
				])
				.optional(),
			category: z
				.enum([
					"INSTALLATION",
					"MAINTENANCE",
					"REPAIR",
					"SUPPORT",
					"BILLING",
					"GENERAL",
				])
				.optional(),
			dueDate: z.coerce.date().nullable().optional(),
			notes: z.string().max(5000).nullable().optional(),
			customerId: z.string().nullable().optional(),
			stationId: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const existing = await db.task.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.title !== undefined) {
			updateData["title"] = input.title;
		}
		if (input.description !== undefined) {
			updateData["description"] = input.description ?? null;
		}
		if (input.priority !== undefined) {
			updateData["priority"] = input.priority;
		}
		if (input.category !== undefined) {
			updateData["category"] = input.category;
		}
		if (input.dueDate !== undefined) {
			updateData["dueDate"] = input.dueDate ?? null;
		}
		if (input.notes !== undefined) {
			updateData["notes"] = input.notes ?? null;
		}
		if (input.customerId !== undefined) {
			updateData["customerId"] = input.customerId ?? null;
		}
		if (input.stationId !== undefined) {
			updateData["stationId"] = input.stationId ?? null;
		}

		// Auto-manage completedAt based on status transitions
		if (input.status !== undefined) {
			updateData["status"] = input.status;
			if (
				input.status === "COMPLETED" &&
				existing.status !== "COMPLETED"
			) {
				updateData["completedAt"] = new Date();
			} else if (
				input.status !== "COMPLETED" &&
				existing.status === "COMPLETED"
			) {
				updateData["completedAt"] = null;
			}
		}

		const task = await db.task.update({
			where: { id: input.id },
			data: updateData,
			select: {
				id: true,
				title: true,
				status: true,
				priority: true,
				category: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.updated(task.id, user.id, input.organizationId, auditContext);

		return { task };
	});
