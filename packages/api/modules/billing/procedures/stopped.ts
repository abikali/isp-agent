import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { customerSearchFilter } from "../lib/filters";
import { resolveYearMonth } from "../lib/resolve-month";
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
			stoppedAccount: true,
			reviewedAt: { not: null },
			...(monthId ? { billingMonthId: monthId } : {}),
		};

		if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}

		const customerWhere: Record<string, unknown> = {
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.search) {
			Object.assign(customerWhere, customerSearchFilter(input.search));
		}
		if (input.groupName) {
			customerWhere["groupName"] = input.groupName;
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
							billingExpiresAt: true,
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
			customExpiry: z.string().datetime().optional(),
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

		const newExpiry = input.customExpiry
			? new Date(input.customExpiry)
			: null;

		await mirrorToIRadius({
			logTag: "iRadius reactivate stopped account",
			failureMessage: "Failed to reactivate customer in iRadius",
			remote: () => iradiusSetActive(payment.customer, true),
			local: () =>
				db.$transaction(async (tx) => {
					// Delete the stopped payment so the customer appears as
					// unpaid in the collector portal and can be collected
					// normally.
					await tx.payment.delete({
						where: { id: input.paymentId },
					});
					await tx.customer.update({
						where: { id: payment.customerId },
						data: {
							status: "ACTIVE",
							...(newExpiry
								? {
										expiresAt: newExpiry,
										billingExpiresAt: newExpiry,
									}
								: {}),
						},
					});
				}),
		});

		return { success: true };
	});
