import { queryAuditLogs } from "@repo/audit";
import { z } from "zod";
import { adminProcedure } from "../../../orpc/procedures";

export const listAdminAuditLogs = adminProcedure
	.route({
		method: "GET",
		path: "/admin/audit-logs",
		tags: ["Administration", "Audit"],
		summary: "List all audit logs (admin only)",
	})
	.input(
		z.object({
			userId: z.string().optional(),
			organizationId: z.string().optional(),
			action: z.string().optional(),
			resourceType: z.string().optional(),
			startDate: z.coerce.date().optional(),
			endDate: z.coerce.date().optional(),
			limit: z.number().min(1).max(100).default(50),
			offset: z.number().min(0).default(0),
		}),
	)
	.handler(async ({ input }) => {
		const params: {
			limit: number;
			offset: number;
			userId?: string;
			organizationId?: string;
			action?: string;
			resourceType?: string;
			startDate?: Date;
			endDate?: Date;
		} = { limit: input.limit, offset: input.offset };
		if (input.userId !== undefined) {
			params.userId = input.userId;
		}
		if (input.organizationId !== undefined) {
			params.organizationId = input.organizationId;
		}
		if (input.action !== undefined) {
			params.action = input.action;
		}
		if (input.resourceType !== undefined) {
			params.resourceType = input.resourceType;
		}
		if (input.startDate !== undefined) {
			params.startDate = input.startDate;
		}
		if (input.endDate !== undefined) {
			params.endDate = input.endDate;
		}
		return queryAuditLogs(params);
	});
