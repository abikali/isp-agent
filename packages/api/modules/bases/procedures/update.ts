import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { baseAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	assertWorkersInScope,
	baseSelect,
	mapBaseWorkers,
} from "../lib/base-helpers";

export const updateBase = protectedProcedure
	.route({
		method: "POST",
		path: "/bases/update",
		tags: ["Bases"],
		summary: "Update a base",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().max(2000).nullable().optional(),
			address: z.string().max(300).nullable().optional(),
			workerIds: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"bases",
			"update",
		);

		const existing = await db.base.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", { message: "Base not found" });
		}

		const data: Record<string, unknown> = {};
		if (input.name !== undefined) {
			data["name"] = input.name;
		}
		if (input.description !== undefined) {
			data["description"] = input.description ?? null;
		}
		if (input.address !== undefined) {
			data["address"] = input.address ?? null;
		}

		let workerIds: string[] | undefined;
		if (input.workerIds !== undefined) {
			workerIds = await assertWorkersInScope(
				input.organizationId,
				activeDealerId,
				input.workerIds,
			);
		}

		const base = await db.$transaction(async (tx) => {
			// Replace-all worker assignments when a new list is provided.
			if (workerIds !== undefined) {
				await tx.baseEmployee.deleteMany({
					where: { baseId: input.id },
				});
				if (workerIds.length > 0) {
					await tx.baseEmployee.createMany({
						data: workerIds.map((employeeId) => ({
							baseId: input.id,
							employeeId,
						})),
					});
				}
			}
			return tx.base.update({
				where: { id: input.id },
				data,
				select: baseSelect,
			});
		});

		const auditContext = getAuditContextFromHeaders(headers);
		baseAudit.updated(base.id, user.id, input.organizationId, auditContext);

		return { base: mapBaseWorkers(base) };
	});
