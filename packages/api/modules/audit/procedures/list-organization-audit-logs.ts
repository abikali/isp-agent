import { requirePermission } from "@repo/api/lib/permission";
import { getOrganizationAuditLogs } from "@repo/audit";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listOrganizationAuditLogs = protectedProcedure
	.route({
		method: "GET",
		path: "/organizations/{organizationId}/audit-logs",
		tags: ["Audit"],
		summary: "List organization audit logs",
	})
	.input(
		z.object({
			organizationId: z.string(),
			action: z.string().optional(),
			startDate: z.coerce.date().optional(),
			endDate: z.coerce.date().optional(),
			limit: z.number().min(1).max(100).default(50),
			offset: z.number().min(0).default(0),
		}),
	)
	.handler(
		async ({
			input: {
				organizationId,
				action,
				startDate,
				endDate,
				limit,
				offset,
			},
			context,
		}) => {
			await requirePermission(
				organizationId,
				context.user.id,
				"audit",
				"view",
			);

			const params: {
				limit: number;
				offset: number;
				action?: string;
				startDate?: Date;
				endDate?: Date;
			} = { limit, offset };
			if (action !== undefined) {
				params.action = action;
			}
			if (startDate !== undefined) {
				params.startDate = startDate;
			}
			if (endDate !== undefined) {
				params.endDate = endDate;
			}
			return getOrganizationAuditLogs(organizationId, params);
		},
	);
