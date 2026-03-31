import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getDealerScopeFilter,
	getPermissionContext,
	resolveCollectorScope,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db, getPrimaryPhone, MAX_PHONES } from "@repo/database";
import { queueWhatsAppReceipt } from "@repo/jobs";
import { logger } from "@repo/logs";
import { sendOrganizationNotification } from "@repo/notifications";
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
			workerId: z.string().optional(),
			noteCategory: z.string().optional(),
			notes: z.string().optional(),
			customerPhones: z
				.array(
					z.object({
						number: z.string().max(50),
						primary: z.boolean(),
					}),
				)
				.max(MAX_PHONES)
				.optional(),
			customerLatitude: z.number().finite().optional(),
			customerLongitude: z.number().finite().optional(),
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

		// Verify worker exists if provided
		if (input.workerId) {
			const worker = await db.employee.findFirst({
				where: {
					id: input.workerId,
					organizationId: input.organizationId,
				},
			});
			if (!worker) {
				throw new ORPCError("NOT_FOUND", {
					message: "Worker not found",
				});
			}
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

		if (input.freeAccount && input.stoppedAccount) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A free account cannot be marked as stopped",
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

		// Create payment in a transaction
		const payment = await db.$transaction(async (tx) => {
			// Prevent duplicate payments for the same customer in the same month
			const existing = await tx.payment.findFirst({
				where: {
					customerId: input.customerId,
					billingMonthId: billingMonth.id,
				},
				select: { id: true },
			});
			if (existing) {
				throw new ORPCError("CONFLICT", {
					message:
						"This customer already has a payment recorded for this billing month",
				});
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
					freeAccount: input.freeAccount,
					stoppedAccount: input.stoppedAccount,
					workerId: input.workerId ?? null,
					noteCategory: input.noteCategory ?? null,
					notes: input.notes ?? null,
				},
			});

			// Update customer fields if changed (phones, location)
			const customerUpdates: Record<string, unknown> = {};
			if (input.customerPhones && input.customerPhones.length > 0) {
				customerUpdates["phones"] = input.customerPhones;
				customerUpdates["mobile"] = getPrimaryPhone(
					input.customerPhones,
				);
			}
			if (
				input.customerLatitude !== undefined &&
				input.customerLongitude !== undefined
			) {
				customerUpdates["latitude"] = input.customerLatitude;
				customerUpdates["longitude"] = input.customerLongitude;
			}
			if (Object.keys(customerUpdates).length > 0) {
				await tx.customer.update({
					where: { id: input.customerId },
					data: customerUpdates,
				});
			}

			// If stopped, deactivate the customer
			if (input.stoppedAccount) {
				await tx.customer.update({
					where: { id: input.customerId },
					data: { status: "INACTIVE" },
				});
			}

			return newPayment;
		});

		// Queue WhatsApp receipt via background worker
		if (!input.stoppedAccount || input.paidAmount > 0) {
			const phone = input.customerPhones
				? getPrimaryPhone(input.customerPhones)
				: (customer.mobile ?? customer.phone);
			if (phone) {
				queueWhatsAppReceipt({ phone, paymentId: payment.id }).catch(
					(err) =>
						logger.warn("[WhatsApp Receipt] Failed to queue job", {
							error: String(err),
						}),
				);
			}
		}

		// If stopped, notify admins and create a task to disable on iRadius
		if (input.stoppedAccount) {
			const customerName =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ") || customer.username;

			const org = await db.organization.findFirst({
				where: { id: input.organizationId },
				select: { slug: true },
			});

			const orgSlug = org?.slug ?? "";

			// Fire-and-forget notification
			sendOrganizationNotification(input.organizationId, {
				category: "monitoring",
				type: "warning",
				title: "Account Stop Requested",
				message: `${customerName} requested to stop their subscription`,
				link: `/app/${orgSlug}/billing/stopped`,
			}).catch((err) =>
				logger.warn("[Stopped Account] Failed to send notification", {
					error: String(err),
				}),
			);

			// Fire-and-forget task creation
			const taskDescription =
				input.paidAmount > 0
					? `Customer "${customerName}" (${customer.username}) paid their final bill and requested to stop their subscription. Please disable their account on iRadius.`
					: `Customer "${customerName}" (${customer.username}) requested to stop their subscription without payment. Please disable their account on iRadius.`;

			db.task
				.create({
					data: {
						organizationId: input.organizationId,
						title: `Disable ${customerName} on iRadius`,
						description: taskDescription,
						priority: "HIGH",
						status: "OPEN",
						category: "BILLING",
						customerId: input.customerId,
						createdById: user.id,
					},
				})
				.catch((err) =>
					logger.warn("[Stopped Account] Failed to create task", {
						error: String(err),
					}),
				);
		}

		return { payment };
	});
