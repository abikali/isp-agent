import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { notifyAdminTelegram } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	getPermissionContext,
	resolveCollectorScope,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db, getPrimaryPhone, MAX_PHONES } from "@repo/database";
import { queueWhatsAppReceipt } from "@repo/jobs";
import { logger } from "@repo/logs";
import {
	notifyBadgeForOrganization,
	sendOrganizationNotification,
} from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	diffMirrorFields,
	type MirrorNextFields,
	pushMirrorDiffToIRadius,
} from "../../customers/lib/mirror-fields";
import { resolveActiveBillingMonth } from "../lib/resolve-month";
import { REVIEW_STOPPED_TASK_TITLE_PREFIX } from "../lib/review-tasks";

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
			referredCustomerId: z.string().optional(),
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
		const dealerFilter = getDealerScopeFilter(activeDealerId);

		const [customer, collector, worker, org] = await Promise.all([
			db.customer.findFirst({
				where: {
					id: input.customerId,
					organizationId: input.organizationId,
					...dealerFilter,
				},
			}),
			db.employee.findFirst({
				where: {
					id: input.collectorId,
					organizationId: input.organizationId,
					status: "ACTIVE",
					...dealerFilter,
				},
			}),
			input.workerId
				? db.employee.findFirst({
						where: {
							id: input.workerId,
							organizationId: input.organizationId,
							status: "ACTIVE",
							...dealerFilter,
						},
					})
				: Promise.resolve(null),
			db.organization.findUnique({
				where: { id: input.organizationId },
				select: { iradiusDisabled: true },
			}),
		]);
		const iradiusDisabled = org?.iradiusDisabled ?? false;
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}
		if (!collector) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collector not found or inactive",
			});
		}
		if (input.workerId && !worker) {
			throw new ORPCError("NOT_FOUND", {
				message: "Worker not found or inactive",
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

		if (input.freeAccount && input.stoppedAccount) {
			throw new ORPCError("BAD_REQUEST", {
				message: "A free account cannot be marked as stopped",
			});
		}

		// Reject "ghost" rows: paidAmount=0 with neither flag set. They satisfy
		// the dedupe check but never count as settled (see SETTLED_PAYMENT in
		// lib/filters.ts), so the customer reappears in the unpaid list every
		// month yet can never be re-collected — they're stuck.
		if (
			input.paidAmount === 0 &&
			!input.freeAccount &&
			!input.stoppedAccount
		) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					"Mark the payment as Free Account or Stopped if no cash was collected",
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

		// Mirror the opportunistic customer enrichment (phones / location) the
		// collector entered on the payment sheet to iRadius *before* persisting
		// it locally — same remote-first, no-drift guarantee as the customer
		// edit form. Only touches iRadius when a field actually changed AND the
		// customer is linked, so a plain collection never depends on iRadius.
		const mirrorNext: MirrorNextFields = {};
		if (input.customerPhones && input.customerPhones.length > 0) {
			mirrorNext.phones = input.customerPhones;
		}
		if (
			input.customerLatitude !== undefined &&
			input.customerLongitude !== undefined
		) {
			mirrorNext.latitude = input.customerLatitude;
			mirrorNext.longitude = input.customerLongitude;
		}
		const mirrorDiff =
			!iradiusDisabled && customer.externalId
				? diffMirrorFields(customer, mirrorNext)
				: null;
		if (
			mirrorDiff &&
			customer.externalId &&
			(mirrorDiff.phonesChanged || mirrorDiff.locationChanged)
		) {
			// Pre-check the same dedupe the transaction enforces so a double
			// submit doesn't push a phone/location change to iRadius and then
			// abort on the duplicate. The transaction re-checks for races.
			const duplicate = await db.payment.findFirst({
				where: {
					customerId: input.customerId,
					billingMonthId: billingMonth.id,
					OR: [
						{ paidAmount: { gt: 0 } },
						{ freeAccount: true },
						{ stoppedAccount: true },
					],
				},
				select: { id: true },
			});
			if (duplicate) {
				throw new ORPCError("CONFLICT", {
					message:
						"This customer already has a payment recorded for this billing month",
				});
			}
			await pushMirrorDiffToIRadius({
				externalId: customer.externalId,
				diff: mirrorDiff,
				next: mirrorNext,
				existing: customer,
			});
		}

		// Create payment in a transaction
		const payment = await db.$transaction(async (tx) => {
			// Prevent duplicate payments for the same customer in the same month.
			// Only block when an existing row is settled (cash or free) or stopped
			// — any leftover ghost row (paidAmount=0, both flags false) shouldn't
			// permanently lock the customer out of being re-collected.
			const existing = await tx.payment.findFirst({
				where: {
					customerId: input.customerId,
					billingMonthId: billingMonth.id,
					OR: [
						{ paidAmount: { gt: 0 } },
						{ freeAccount: true },
						{ stoppedAccount: true },
					],
				},
				select: { id: true },
			});
			if (existing) {
				throw new ORPCError("CONFLICT", {
					message:
						"This customer already has a payment recorded for this billing month",
				});
			}

			// Resolve the invoice this payment satisfies. Normally exists
			// because `openBillingMonth` generates an invoice for every
			// billable customer when the month opens; may be null for edge
			// cases (customer added or activated mid-month outside the
			// generator's eligibility, free-group customers collecting addons).
			const invoice = await tx.customerInvoice.findFirst({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					year: billingMonth.year,
					month: billingMonth.month,
					voidedAt: null,
				},
				select: { id: true },
			});

			// Validate referrer belongs to the same organization and dealer
			// (only when free account; ignored otherwise)
			if (input.referredCustomerId && input.freeAccount) {
				const referrer = await tx.customer.findFirst({
					where: {
						id: input.referredCustomerId,
						organizationId: input.organizationId,
						...getDealerScopeFilter(activeDealerId),
					},
					select: { id: true },
				});
				if (!referrer) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Referred customer not found",
					});
				}
			}

			const newPayment = await tx.payment.create({
				data: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					billingMonthId: billingMonth.id,
					invoiceId: invoice?.id ?? null,
					collectorId: input.collectorId,
					accountPrice: input.accountPrice,
					paidAmount: input.paidAmount,
					discount: input.discount,
					freeAccount: input.freeAccount,
					stoppedAccount: input.stoppedAccount,
					workerId: input.workerId ?? null,
					// Normalize to null when blank/whitespace so a non-note never
					// trips the `notes IS NOT NULL` needs-review predicate.
					noteCategory: input.noteCategory?.trim() || null,
					notes: input.notes?.trim() || null,
					referredCustomerId:
						input.freeAccount && input.referredCustomerId
							? input.referredCustomerId
							: null,
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

			return newPayment;
		});

		// Log payment creation activity
		const collectorName = collector.name;
		db.payment
			.update({
				where: { id: payment.id },
				data: {
					activityLog: [
						{
							action: "payment_created",
							status: "success" as const,
							detail: `Recorded by ${collectorName}`,
							timestamp: new Date().toISOString(),
						},
					],
				},
			})
			.catch((err) =>
				logger.warn("[Payment] Failed to log creation activity", {
					error: String(err),
				}),
			);

		// Queue WhatsApp receipt via background worker (skip for stopped accounts)
		if (!input.stoppedAccount) {
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
				select: {
					slug: true,
					stoppedPaymentTaskEnabled: true,
					stoppedPaymentNotifyEnabled: true,
				},
			});

			const orgSlug = org?.slug ?? "";

			// Fire-and-forget notification (admin-configurable)
			if (org?.stoppedPaymentNotifyEnabled !== false) {
				sendOrganizationNotification(input.organizationId, {
					category: "monitoring",
					type: "warning",
					title: "Stopped Payment Needs Review",
					message: `${customerName} marked as stopped — review required before deactivation`,
					link: `/app/${orgSlug}/billing/payments`,
				}).catch((err) =>
					logger.warn(
						"[Stopped Account] Failed to send notification",
						{
							error: String(err),
						},
					),
				);
			}

			// Fire-and-forget task creation (admin-configurable)
			if (org?.stoppedPaymentTaskEnabled !== false) {
				const taskDescription =
					input.paidAmount > 0
						? `Customer "${customerName}" (${customer.username}) paid their final bill and requested to stop. Review and approve in Billing → Payments → Needs Review to deactivate.`
						: `Customer "${customerName}" (${customer.username}) requested to stop without payment. Review and approve in Billing → Payments → Needs Review to deactivate.`;

				db.task
					.create({
						data: {
							organizationId: input.organizationId,
							title: `${REVIEW_STOPPED_TASK_TITLE_PREFIX} ${customerName}`,
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
		}

		notifyBadgeForOrganization(input.organizationId);

		// Admin Telegram alert (opt-in per org) when a collector records a payment.
		if (input.paidAmount > 0) {
			const payerName =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ")
					.trim() ||
				customer.username ||
				"customer";
			notifyAdminTelegram(
				input.organizationId,
				"paymentCollected",
				`💵 Payment collected\n${payerName}: ${input.paidAmount}\nBy: ${collectorName}`,
			);
		}

		return { payment };
	});
