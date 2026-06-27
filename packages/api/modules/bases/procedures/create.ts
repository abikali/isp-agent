import { requirePermission } from "@repo/api/lib/permission";
import { baseAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	assertWorkersInScope,
	baseSelect,
	mapBaseWorkers,
} from "../lib/base-helpers";

export const createBase = protectedProcedure
	.route({
		method: "POST",
		path: "/bases",
		tags: ["Bases"],
		summary: "Create a new base",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			description: z.string().max(2000).optional(),
			address: z.string().max(300).optional(),
			workerIds: z.array(z.string()).default([]),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"bases",
			"create",
		);

		const workerIds = await assertWorkersInScope(
			input.organizationId,
			activeDealerId,
			input.workerIds,
		);

		const base = await db.base.create({
			data: {
				organizationId: input.organizationId,
				dealerId: activeDealerId ?? null,
				name: input.name,
				description: input.description ?? null,
				address: input.address ?? null,
				workers: {
					create: workerIds.map((employeeId) => ({ employeeId })),
				},
			},
			select: baseSelect,
		});

		const auditContext = getAuditContextFromHeaders(headers);
		baseAudit.created(
			base.id,
			user.id,
			input.organizationId,
			auditContext,
			{
				name: input.name,
			},
		);

		return { base: mapBaseWorkers(base) };
	});
