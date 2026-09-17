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
	assertCustomerStaysOnLine,
	loadOrgDealerLines,
	resolveCustomerLine,
} from "../../dealers/lib/internal-lines";
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

/**
 * Which dealer line's plans a customer can move to, for plan pickers. Read
 * from iRadius like the plan-change guard, so the picker offers exactly what
 * the server accepts. `restrictTo: null` = no restriction (the org has no
 * internal lines, or iRadius has the customer under another dealer — the
 * change is refused with an explanation then); `lineId: null` = the main line.
 */
export const getCustomerPlanLine = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/plan-line",
		tags: ["Customers"],
		summary: "The dealer line whose plans this customer can move to",
	})
	.input(z.object({ organizationId: z.string(), customerId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);
		const lines = await loadOrgDealerLines(input.organizationId);
		if (lines.lines.length === 0) {
			return { restrictTo: null };
		}
		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				externalId: true,
				plan: { select: { dealerId: true, dealerExternalId: true } },
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}
		const { line } = await resolveCustomerLine(
			customer,
			lines,
			!iradiusDisabled,
		);
		if (line.kind === "foreign") {
			return { restrictTo: null };
		}
		return {
			restrictTo: { lineId: line.kind === "line" ? line.dealerId : null },
		};
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
			select: {
				externalId: true,
				username: true,
				discount: true,
				iptvPrice: true,
				realIpPrice: true,
				plan: { select: { dealerId: true, dealerExternalId: true } },
			},
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
			select: {
				externalId: true,
				name: true,
				dealerId: true,
				dealerExternalId: true,
			},
		});
		if (!newPlan?.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Plan not linked to iRadius",
			});
		}
		// iRadius-disabled orgs were refused above, so the line is read from
		// iRadius — the local plan can be stale.
		await assertCustomerStaysOnLine({
			organizationId: input.organizationId,
			customer,
			newPlan,
			readIRadius: true,
		});

		try {
			const preview = await previewAccountTypeChange(
				customer,
				Number.parseInt(newPlan.externalId, 10),
			);
			// A plan change leaves the recurring discount and add-on prices
			// exactly as they are. Surface them so the admin sees what carries
			// over instead of discovering it on next month's invoice.
			return {
				...preview,
				carriesOver: {
					discount: customer.discount ?? 0,
					iptvPrice: customer.iptvPrice ?? 0,
					realIpPrice: customer.realIpPrice ?? 0,
				},
			};
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
			select: {
				externalId: true,
				username: true,
				collectorId: true,
				plan: { select: { dealerId: true, dealerExternalId: true } },
			},
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
				dealerId: true,
				dealerExternalId: true,
			},
		});
		if (!newPlan?.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Plan not linked to iRadius",
			});
		}
		// iRadius-disabled orgs were refused above, so the line is read from
		// iRadius — the local plan can be stale.
		await assertCustomerStaysOnLine({
			organizationId: input.organizationId,
			customer,
			newPlan,
			readIRadius: true,
		});

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
