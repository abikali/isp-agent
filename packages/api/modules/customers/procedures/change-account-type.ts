import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	type AccountTypeChangeResult,
	executeAccountTypeChange,
	previewAccountTypeChange,
} from "../lib/iradius-api";
import { mirrorToIRadius } from "../lib/iradius-mirror";
import { planMonthlyRate } from "../lib/plan-rate";

const input = z.object({
	organizationId: z.string(),
	customerId: z.string(),
	newPlanId: z.string(),
});

export const previewAccountTypeChangeProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/preview-account-type-change",
		tags: ["Customers"],
		summary: "Preview an iRadius account type change with billing info",
	})
	.input(input)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"iRadius is disabled for this organization — preview is not available",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { externalId: true, username: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}
		if (!customer.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Customer not linked to iRadius",
			});
		}

		const newPlan = await db.servicePlan.findFirst({
			where: {
				id: input.newPlanId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { externalId: true, name: true },
		});
		if (!newPlan?.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Plan not linked to iRadius",
			});
		}

		try {
			return await previewAccountTypeChange(
				customer,
				Number.parseInt(newPlan.externalId, 10),
			);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "iRadius preview failed";

			// iRadius reports the customer is already on this account type — local
			// planId has drifted. Don't silently overwrite (planId is conflict-
			// tracked); direct the user to resync.
			if (/already on this account type/i.test(message)) {
				throw new ORPCError("CONFLICT", {
					message: `This customer is already on "${newPlan.name}" in iRadius. The local plan is out of sync — click "Sync from iRadius" to refresh.`,
				});
			}

			throw new ORPCError("BAD_REQUEST", { message });
		}
	});

export const executeAccountTypeChangeProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/execute-account-type-change",
		tags: ["Customers"],
		summary: "Execute an iRadius account type change and update local plan",
	})
	.input(input)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
				input.organizationId,
				user.id,
				"customers",
				"update",
			);
		if (iradiusDisabled) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"iRadius is disabled for this organization — change the plan via the customer edit form instead",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { externalId: true, username: true, collectorId: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		await verifyCustomerOwnership(permCtx, "update", customer.collectorId);

		const newPlan = await db.servicePlan.findFirst({
			where: {
				id: input.newPlanId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				externalId: true,
				sellingPrice: true,
				rate: true,
				monthlyPrice: true,
			},
		});
		if (!newPlan?.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Plan not linked to iRadius",
			});
		}

		// Mirror what iRadius just set on User.AccountPrice so the local
		// monthlyRate doesn't drift and trip the next sync's conflict queue.
		const newMonthlyRate = planMonthlyRate(newPlan);

		let result!: AccountTypeChangeResult;
		await mirrorToIRadius({
			logTag: "iRadius change account type",
			failureMessage: "Failed to change plan in iRadius",
			remote: async () => {
				result = await executeAccountTypeChange(
					customer,
					Number.parseInt(newPlan.externalId as string, 10),
				);
			},
			local: () =>
				db.customer.update({
					where: { id: input.customerId },
					data: {
						planId: input.newPlanId,
						monthlyRate: newMonthlyRate,
					},
				}),
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.updated(
			input.customerId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return result;
	});
