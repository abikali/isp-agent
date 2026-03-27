import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getPermissionContext,
	resolveCollectorScope,
	verifyPermission,
} from "@repo/api/lib/permission";
import type { PaymentNoteCategory, PaymentStatus } from "@repo/database";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments",
		tags: ["Billing"],
		summary: "Record a payment collection",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			collectorId: z.string(),
			accountPrice: z.number().finite().min(0),
			paidAmount: z.number().finite().min(0),
			discount: z.number().finite().min(0).default(0),
			freeAccount: z.boolean().default(false),
			stoppedAccount: z.boolean().default(false),
			noteCategory: z
				.enum([
					"DOWNGRADE",
					"UPGRADE",
					"DISCOUNT",
					"REFERRAL",
					"MOVED",
					"POOR_SERVICE",
					"CANT_PAY",
					"TEMP_STOP",
				])
				.optional(),
			notes: z.string().optional(),
			customerMobile: z.string().optional(),
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
				message: "Can only record payments for your own collections",
			});
		}

		// Verify customer exists
		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		// Verify collector exists
		const collector = await db.employee.findFirst({
			where: {
				id: input.collectorId,
				organizationId: input.organizationId,
			},
		});
		if (!collector) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collector not found",
			});
		}

		// Get or create current billing cycle
		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;

		const cycle = await db.billingCycle.upsert({
			where: {
				organizationId_year_month: {
					organizationId: input.organizationId,
					year,
					month,
				},
			},
			update: {},
			create: {
				organizationId: input.organizationId,
				year,
				month,
				status: "OPEN",
			},
		});

		if (cycle.status === "CLOSED") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot create payments in a closed billing cycle",
			});
		}

		// Determine payment status
		const totalDue = input.freeAccount
			? (customer.iptvPrice ?? 0) + (customer.realIpPrice ?? 0)
			: input.accountPrice +
				(customer.iptvPrice ?? 0) +
				(customer.realIpPrice ?? 0) -
				input.discount;

		let status: PaymentStatus = "PENDING";
		if (input.stoppedAccount) {
			status = "STOPPED";
		} else if (Math.abs(input.paidAmount - totalDue) < 0.01) {
			status = "PROCESSED";
		} else if (input.paidAmount > 0 && input.paidAmount < totalDue) {
			status = "PARTIAL";
		}

		// Create payment and mark customer as paid in a transaction
		const payment = await db.$transaction(async (tx) => {
			const newPayment = await tx.payment.create({
				data: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					billingCycleId: cycle.id,
					collectorId: input.collectorId,
					accountPrice: input.accountPrice,
					paidAmount: input.paidAmount,
					discount: input.discount,
					status,
					freeAccount: input.freeAccount,
					stoppedAccount: input.stoppedAccount,
					noteCategory:
						(input.noteCategory as PaymentNoteCategory) ?? null,
					notes: input.notes ?? null,
					processedAt: status === "PROCESSED" ? now : null,
				},
			});

			// Update customer mobile if provided and changed
			const customerUpdateData: Record<string, unknown> = {};
			if (!input.stoppedAccount) {
				customerUpdateData["paidCurrentCycle"] = true;
			}
			if (
				input.customerMobile &&
				input.customerMobile !== customer.mobile
			) {
				customerUpdateData["mobile"] = input.customerMobile;
			}
			if (Object.keys(customerUpdateData).length > 0) {
				await tx.customer.update({
					where: { id: input.customerId },
					data: customerUpdateData,
				});
			}

			return newPayment;
		});

		return { payment };
	});
