import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getEmployee = protectedProcedure
	.route({
		method: "GET",
		path: "/employees/{id}",
		tags: ["Employees"],
		summary: "Get a single employee with stations and recent tasks",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"employees",
			"read",
		);

		const employee = await db.employee.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			include: {
				dealer: { select: { id: true, name: true } },
				stations: {
					select: {
						assignedAt: true,
						station: {
							select: {
								id: true,
								name: true,
								address: true,
								status: true,
							},
						},
					},
				},
				taskAssignments: {
					select: {
						assignedAt: true,
						task: {
							select: {
								id: true,
								title: true,
								status: true,
								priority: true,
								category: true,
								source: true,
								dueDate: true,
							},
						},
					},
					orderBy: { assignedAt: "desc" },
					take: 20,
				},
			},
		});

		if (!employee) {
			throw new ORPCError("NOT_FOUND", {
				message: "Employee not found",
			});
		}

		return { employee };
	});
