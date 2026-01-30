import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
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
			// Ensure user is a member of the organization
			const membership = await verifyOrganizationMembership(
				organizationId,
				context.user.id,
			);

			if (!membership) {
				throw new ORPCError("FORBIDDEN", {
					message: "Access denied",
				});
			}

			// Only admins and owners can view audit logs
			if (membership.role !== "admin" && membership.role !== "owner") {
				throw new ORPCError("FORBIDDEN", {
					message: "Access denied",
				});
			}

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
