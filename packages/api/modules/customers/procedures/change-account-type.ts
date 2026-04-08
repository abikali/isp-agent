import { ORPCError } from "@orpc/server";
import {
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
	executeAccountTypeChange,
	previewAccountTypeChange,
} from "../lib/iradius-api";

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
		await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
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
			},
			select: { externalId: true },
		});
		if (!newPlan?.externalId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Plan not linked to iRadius",
			});
		}

		const preview = await previewAccountTypeChange(
			customer,
			Number.parseInt(newPlan.externalId, 10),
		);
		return preview;
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
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
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

		const result = await executeAccountTypeChange(
			customer,
			Number.parseInt(newPlan.externalId, 10),
		);

		// Mirror what iRadius just set on User.AccountPrice so the local
		// monthlyRate doesn't go stale (and doesn't land in the conflict
		// queue on the next sync). Prefer sellingPrice → rate → monthlyPrice.
		// Note: we deliberately do NOT touch billingExpiresAt — it's the
		// frozen snapshot collectors use to decide who's due, and it must
		// stay decoupled from mid-cycle plan changes.
		const newMonthlyRate =
			newPlan.sellingPrice ?? newPlan.rate ?? newPlan.monthlyPrice;

		await db.customer.update({
			where: { id: input.customerId },
			data: {
				planId: input.newPlanId,
				monthlyRate: newMonthlyRate,
			},
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
