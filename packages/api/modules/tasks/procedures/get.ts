import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getTask = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks/{id}",
		tags: ["Tasks"],
		summary: "Get a single task with assignments and linked entities",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const task = await db.task.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
			include: {
				createdBy: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
				customer: {
					select: {
						id: true,
						fullName: true,
						accountNumber: true,
					},
				},
				station: {
					select: {
						id: true,
						name: true,
						address: true,
					},
				},
				assignments: {
					select: {
						assignedAt: true,
						employee: {
							select: {
								id: true,
								name: true,
								employeeNumber: true,
								position: true,
							},
						},
					},
				},
			},
		});

		if (!task) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		return { task };
	});
