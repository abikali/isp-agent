import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getDealerScopeFilter,
	getPermissionContext,
	resolveCollectorScope,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveActiveBillingMonth } from "../lib/resolve-month";

export const stopAccount = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/stop",
		tags: ["Billing"],
		summary: "Mark a customer account as stopped for this billing month",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			collectorId: z.string(),
			noteCategory: z.string().optional(),
			notes: z.string().optional(),
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

		const permCtx = getPermissionContext(
			user.id,
			input.organizationId,
			member.role,
			member.rolePermissions,
		);
		verifyPermission(permCtx, "billing", "collect");

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && employeeId !== input.collectorId) {
			throw new ORPCError("FORBIDDEN", {
				message: "Can only record for your own collections",
			});
		}

		const activeDealerId = member.activeDealerId ?? null;

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		const billingMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);

		if (billingMonth.locked) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot modify a locked billing month",
			});
		}

		// Create a STOPPED payment record
		const payment = await db.payment.create({
			data: {
				organizationId: input.organizationId,
				customerId: input.customerId,
				billingMonthId: billingMonth.id,
				collectorId: input.collectorId,
				accountPrice: customer.monthlyRate ?? 0,
				paidAmount: 0,
				discount: customer.discount ?? 0,
				status: "STOPPED",
				freeAccount: false,
				noteCategory: input.noteCategory ?? null,
				notes: input.notes ?? null,
			},
		});

		return { payment };
	});
