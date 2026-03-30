import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getDealerScopeFilter,
	getPermissionContext,
	resolveCollectorScope,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queueWhatsAppReceipt } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveActiveBillingMonth } from "../lib/resolve-month";

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
			noteCategory: z.string().optional(),
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

		const activeDealerId = member.activeDealerId ?? null;

		// Verify customer exists (and belongs to active dealer if scoped)
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

		// Use the active billing month (latest unlocked)
		const billingMonth = await resolveActiveBillingMonth(
			input.organizationId,
		);

		if (billingMonth.locked) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Cannot create payments in a locked billing month",
			});
		}

		// Determine total due for validation
		const totalDue = input.freeAccount
			? (customer.iptvPrice ?? 0) + (customer.realIpPrice ?? 0)
			: input.accountPrice +
				(customer.iptvPrice ?? 0) +
				(customer.realIpPrice ?? 0) -
				input.discount;

		// Require a note for stopped accounts
		if (
			input.stoppedAccount &&
			!input.noteCategory &&
			!input.notes?.trim()
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"A note category or note is required when marking an account as stopped",
			});
		}

		// Require a note when paid amount differs from total due
		const isAmountMismatch =
			Math.abs(input.paidAmount - totalDue) >= 0.01 &&
			!input.stoppedAccount &&
			input.paidAmount > 0;

		if (isAmountMismatch && !input.noteCategory && !input.notes?.trim()) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"A note category or note is required when the paid amount differs from the amount due",
			});
		}

		const status = input.stoppedAccount ? "STOPPED" : "COLLECTED";

		// Create payment in a transaction
		const payment = await db.$transaction(async (tx) => {
			// Prevent duplicate payments for the same customer in the same month
			// (stopped entries are always allowed — a customer can be stopped and later collected)
			if (!input.stoppedAccount) {
				const existing = await tx.payment.findFirst({
					where: {
						customerId: input.customerId,
						billingMonthId: billingMonth.id,
						status: "COLLECTED",
					},
					select: { id: true },
				});
				if (existing) {
					throw new ORPCError("CONFLICT", {
						message:
							"This customer already has a payment recorded for this billing month",
					});
				}
			}

			const newPayment = await tx.payment.create({
				data: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					billingMonthId: billingMonth.id,
					collectorId: input.collectorId,
					accountPrice: input.accountPrice,
					paidAmount: input.paidAmount,
					discount: input.discount,
					status,
					freeAccount: input.freeAccount,
					noteCategory: input.noteCategory ?? null,
					notes: input.notes ?? null,
				},
			});

			// Update customer mobile if provided and changed
			if (
				input.customerMobile &&
				input.customerMobile !== customer.mobile
			) {
				await tx.customer.update({
					where: { id: input.customerId },
					data: { mobile: input.customerMobile },
				});
			}

			return newPayment;
		});

		// Queue WhatsApp receipt via background worker
		const phone = input.customerMobile ?? customer.mobile ?? customer.phone;
		if (phone) {
			queueWhatsAppReceipt({ phone, paymentId: payment.id }).catch(
				(err) =>
					logger.warn("[WhatsApp Receipt] Failed to queue job", {
						error: String(err),
					}),
			);
		}

		return { payment };
	});
