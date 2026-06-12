import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createFollowup = protectedProcedure
	.route({
		method: "POST",
		path: "/followups",
		tags: ["Followups"],
		summary: "Create a follow-up",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string().optional(),
			customerName: z.string().max(255).optional(),
			mobile: z.string().max(50).optional(),
			groupName: z.string().max(100).optional(),
			status: z.string().max(100).optional(),
			note: z.string().max(2000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"followups",
			"create",
		);

		let customerName = input.customerName ?? null;
		let customerUsername: string | null = null;
		let mobile = input.mobile ?? null;
		let groupName = input.groupName ?? null;

		if (input.customerId) {
			const customer = await db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
				},
				select: {
					firstName: true,
					lastName: true,
					username: true,
					mobile: true,
					groupName: true,
				},
			});
			if (!customer) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer not found",
				});
			}
			customerName =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ") || customerName;
			customerUsername = customer.username;
			mobile = mobile ?? customer.mobile;
			groupName = groupName ?? customer.groupName;
		}

		const followup = await db.followup.create({
			data: {
				organizationId: input.organizationId,
				customerId: input.customerId ?? null,
				customerName,
				customerUsername,
				mobile,
				groupName,
				status: input.status ?? "new",
				note: input.note ?? null,
			},
		});

		return { followup };
	});

export const updateFollowup = protectedProcedure
	.route({
		method: "PATCH",
		path: "/followups/{id}",
		tags: ["Followups"],
		summary: "Update a follow-up (status, notes)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			status: z.string().max(100).optional(),
			note: z.string().max(2000).optional(),
			collectorNote: z.string().max(500).optional(),
			isDone: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"followups",
			"update",
		);

		const followup = await db.followup.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!followup) {
			throw new ORPCError("NOT_FOUND", {
				message: "Follow-up not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.status !== undefined) {
			updateData["status"] = input.status;
		}
		if (input.note !== undefined) {
			updateData["note"] = input.note;
		}
		if (input.collectorNote !== undefined) {
			updateData["collectorNote"] = input.collectorNote;
		}
		if (input.isDone !== undefined) {
			updateData["isDone"] = input.isDone;
			updateData["doneAt"] = input.isDone ? new Date() : null;
		}

		const updated = await db.followup.update({
			where: { id: input.id },
			data: updateData,
		});

		return { followup: updated };
	});

export const deleteFollowup = protectedProcedure
	.route({
		method: "DELETE",
		path: "/followups/{id}",
		tags: ["Followups"],
		summary: "Delete a follow-up",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"followups",
			"delete",
		);

		const followup = await db.followup.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!followup) {
			throw new ORPCError("NOT_FOUND", {
				message: "Follow-up not found",
			});
		}

		await db.followup.delete({ where: { id: input.id } });

		return { success: true };
	});
