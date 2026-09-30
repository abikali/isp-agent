import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { probeIRadiusBridge } from "@repo/jobs";
import { logger } from "@repo/logs";
import { notifyBadgeForOrganization } from "@repo/notifications";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { customerSearchWhere } from "../../customers/lib/customer-search";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import {
	customExpiryValues,
	reactivateInIRadius,
} from "../../customers/lib/reactivate-in-iradius";
import {
	APPROVED_STOPPED_PAYMENT,
	assignmentFilterValue,
	PENDING_STOPPED_PAYMENT,
} from "../lib/filters";
import { unvoidInvoice } from "../lib/invoice-void";
import { resolveYearMonth } from "../lib/resolve-month";
import {
	cancelOpenUninstallTasks,
	closeReviewTasksForCustomer,
} from "../lib/review-tasks";
import { monthSpecSchema, paginationSchema } from "../lib/schemas";

export const listStoppedAccounts = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/stopped",
		tags: ["Billing"],
		summary: "List stopped/suspended accounts from payments",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				search: z.string().optional(),
				groupName: z.string().optional(),
				collectorId: z.string().optional(),
				sortBy: z
					.enum(["paidAt", "customerName", "groupName"])
					.default("paidAt"),
				sortOrder: z.enum(["asc", "desc"]).default("desc"),
			})
			.merge(monthSpecSchema)
			.merge(paginationSchema()),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const { billingMonthId: monthId } = await resolveYearMonth(
			input.organizationId,
			input.year,
			input.month,
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			...APPROVED_STOPPED_PAYMENT,
			...(monthId ? { billingMonthId: monthId } : {}),
		};

		if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}

		const customerWhere: Record<string, unknown> = {
			...getDealerScopeFilter(activeDealerId),
			// "Inactive + delete" soft-deletes the customer: it is gone from iRadius
			// and cannot be reactivated, so it leaves this list.
			deletedAt: null,
		};
		if (input.search?.trim()) {
			customerWhere["AND"] = [
				await customerSearchWhere(input.organizationId, input.search),
			];
		}
		if (input.groupName) {
			customerWhere["groupName"] = assignmentFilterValue(input.groupName);
		}
		if (Object.keys(customerWhere).length > 0) {
			where["customer"] = customerWhere;
		}

		const [payments, total] = await Promise.all([
			db.payment.findMany({
				where,
				select: {
					id: true,
					accountPrice: true,
					paidAmount: true,
					discount: true,
					noteCategory: true,
					notes: true,
					paidAt: true,
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							username: true,
							mobile: true,
							phone: true,
							groupName: true,
							expiresAt: true,
							externalId: true,
							status: true,
							plan: { select: { id: true, name: true } },
							collector: { select: { id: true, name: true } },
						},
					},
					collector: { select: { id: true, name: true } },
				},
				orderBy:
					input.sortBy === "customerName"
						? { customer: { firstName: input.sortOrder } }
						: input.sortBy === "groupName"
							? { customer: { groupName: input.sortOrder } }
							: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.payment.count({ where }),
		]);

		return {
			payments,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});

export const reactivateAccount = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/stopped/reactivate",
		tags: ["Billing"],
		summary: "Reactivate a stopped account",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
			/**
			 * Renew one period through iRadius's own renew (charges the
			 * dealer; expiry = max(expiry, today) + period).
			 */
			renewInIRadius: z.boolean().default(false),
			/** YYYY-MM-DD; written to iRadius and locally at 23:59:00. */
			customExpiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
				.optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId, iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				stoppedAccount: true,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			include: { customer: true },
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Stopped payment not found",
			});
		}

		if (
			input.renewInIRadius &&
			(iradiusDisabled || !payment.customer.externalId)
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Renew on iRadius needs a customer linked to iRadius",
			});
		}

		const customExpiryDate = input.customExpiryDate ?? null;
		// iRadius-disabled orgs skip the remote step; the operator's date
		// still applies locally.
		let newExpiry = customExpiryDate
			? customExpiryValues(customExpiryDate).date
			: null;

		await mirrorToIRadius({
			iradiusDisabled,
			logTag: "iRadius reactivate stopped account",
			failureMessage: "Failed to reactivate customer in iRadius",
			remote: async () => {
				// The expiry goes to iRadius too: a local-only expiresAt was
				// reverted by the next sync (it is auto-updated from iRadius).
				({ expiresAt: newExpiry } = await reactivateInIRadius({
					customer: payment.customer,
					activate: true,
					renew: input.renewInIRadius,
					customExpiryDate,
					reason: "Reactivated from stopped accounts",
				}));
			},
			local: () =>
				db.$transaction(async (tx) => {
					await tx.payment.delete({
						where: { id: input.paymentId },
					});
					await tx.customer.update({
						where: { id: payment.customerId },
						data: {
							status: "ACTIVE",
							...(newExpiry ? { expiresAt: newExpiry } : {}),
						},
					});
					// Restore the invoice that approve-stop had voided — the
					// customer is back, the bill is back on the books.
					if (payment.invoiceId) {
						await unvoidInvoice(tx, payment.invoiceId);
					}
				}),
		});

		await closeReviewTasksForCustomer(
			input.organizationId,
			payment.customerId,
		);
		void cancelOpenUninstallTasks(payment.customerId);
		notifyBadgeForOrganization(input.organizationId);

		return { success: true };
	});

// ─── Pending-stopped review queue ─────────────────────────────────

export const listPendingStoppedPayments = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/stopped/pending",
		tags: ["Billing"],
		summary: "List stopped payments awaiting admin approval or decline",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				search: z.string().optional(),
				groupName: z.string().optional(),
				collectorId: z.string().optional(),
				sortBy: z
					.enum(["paidAt", "customerName", "groupName"])
					.default("paidAt"),
				sortOrder: z.enum(["asc", "desc"]).default("desc"),
			})
			.merge(monthSpecSchema)
			.merge(paginationSchema()),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const { billingMonthId: monthId } = await resolveYearMonth(
			input.organizationId,
			input.year,
			input.month,
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			...PENDING_STOPPED_PAYMENT,
			...(monthId ? { billingMonthId: monthId } : {}),
		};

		if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}

		const customerWhere: Record<string, unknown> = {
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.search?.trim()) {
			customerWhere["AND"] = [
				await customerSearchWhere(input.organizationId, input.search),
			];
		}
		if (input.groupName) {
			customerWhere["groupName"] = assignmentFilterValue(input.groupName);
		}
		if (Object.keys(customerWhere).length > 0) {
			where["customer"] = customerWhere;
		}

		const [payments, total] = await Promise.all([
			db.payment.findMany({
				where,
				select: {
					id: true,
					accountPrice: true,
					paidAmount: true,
					discount: true,
					noteCategory: true,
					notes: true,
					paidAt: true,
					// "Notify customer" on a pending stop: when it was last sent
					// and each channel's latest outcome (badge tooltip).
					stopNoticeSentAt: true,
					notifications: {
						where: { kind: "stop_notice" },
						orderBy: { createdAt: "desc" },
						take: 4,
						select: {
							channel: true,
							status: true,
							error: true,
							createdAt: true,
						},
					},
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							username: true,
							mobile: true,
							phone: true,
							groupName: true,
							expiresAt: true,
							status: true,
							plan: { select: { id: true, name: true } },
							collector: { select: { id: true, name: true } },
						},
					},
					collector: { select: { id: true, name: true } },
					billingMonth: { select: { year: true, month: true } },
				},
				orderBy:
					input.sortBy === "customerName"
						? { customer: { firstName: input.sortOrder } }
						: input.sortBy === "groupName"
							? { customer: { groupName: input.sortOrder } }
							: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.payment.count({ where }),
		]);

		return {
			payments,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});

// ─── iRadius bridge status ────────────────────────────────────────

/**
 * Is the LibanCom bridge servlet (needed to delete / renew in iRadius)
 * installed right now? The stop-approval dialog disables "Inactive + delete"
 * while it is missing, instead of failing on submit.
 */
export const getIRadiusBridgeStatus = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/iradius-bridge-status",
		tags: ["Billing"],
		summary: "Whether the iRadius bridge servlet is reachable",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { iradiusDisabled } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);
		return {
			status: iradiusDisabled
				? ("unconfigured" as const)
				: await probeIRadiusBridge(),
		};
	});

// ─── Decline a pending stop ───────────────────────────────────────

export const declineStoppedPayment = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/stopped/decline",
		tags: ["Billing"],
		summary:
			"Decline a pending stop — deletes the payment and returns the customer to the collector list",
	})
	.input(
		z.object({
			organizationId: z.string(),
			paymentId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const payment = await db.payment.findFirst({
			where: {
				id: input.paymentId,
				organizationId: input.organizationId,
				...PENDING_STOPPED_PAYMENT,
				...getDealerScopeViaCustomer(activeDealerId),
			},
			select: {
				id: true,
				customerId: true,
			},
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message:
					"Pending stopped payment not found (already reviewed or deleted)",
			});
		}

		// Decline = delete the Payment row entirely. Customer stays ACTIVE
		// (they were never flipped), their invoice is not voided, so they
		// reappear on the collector's unpaid list immediately.
		await db.payment.delete({ where: { id: input.paymentId } });

		await closeReviewTasksForCustomer(
			input.organizationId,
			payment.customerId,
		);

		logger.info("[Stopped Payment] Declined by admin", {
			paymentId: input.paymentId,
			customerId: payment.customerId,
			declinedBy: user.id,
		});

		notifyBadgeForOrganization(input.organizationId);

		return { success: true };
	});
