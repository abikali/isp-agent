import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	resolveActiveBillingMonth,
	resolveBillingMonthId,
} from "../lib/resolve-month";

export const listStoppedAccounts = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/stopped",
		tags: ["Billing"],
		summary: "List stopped/suspended accounts from payments",
	})
	.input(
		z.object({
			organizationId: z.string(),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
			search: z.string().optional(),
			groupName: z.string().optional(),
			collectorId: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		let year = input.year;
		let month = input.month;
		let monthId: string | undefined;
		if (year == null || month == null) {
			const active = await resolveActiveBillingMonth(
				input.organizationId,
			);
			year = year ?? active.year;
			month = month ?? active.month;
			monthId = active.id;
		} else {
			monthId = await resolveBillingMonthId(
				input.organizationId,
				year,
				month,
			);
		}

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "STOPPED",
			...(monthId ? { billingMonthId: monthId } : {}),
		};

		if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}

		const customerWhere: Record<string, unknown> = {
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.search) {
			customerWhere["OR"] = [
				{ firstName: { contains: input.search, mode: "insensitive" } },
				{ lastName: { contains: input.search, mode: "insensitive" } },
				{ username: { contains: input.search, mode: "insensitive" } },
			];
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
							groupName: true,
							expiresAt: true,
							status: true,
							plan: { select: { id: true, name: true } },
							collector: { select: { id: true, name: true } },
						},
					},
					collector: { select: { id: true, name: true } },
				},
				orderBy: { paidAt: "desc" },
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
				status: "STOPPED",
				...getDealerScopeViaCustomer(activeDealerId),
			},
			include: { customer: true },
		});

		if (!payment) {
			throw new ORPCError("NOT_FOUND", {
				message: "Stopped payment not found",
			});
		}

		await db.$transaction(async (tx) => {
			// Change payment from STOPPED to COLLECTED
			await tx.payment.update({
				where: { id: input.paymentId },
				data: {
					status: "COLLECTED",
				},
			});

			// Reactivate customer
			await tx.customer.update({
				where: { id: payment.customerId },
				data: {
					status: "ACTIVE",
					...(input.customExpiry
						? { expiresAt: new Date(input.customExpiry) }
						: {}),
				},
			});
		});

		return { success: true };
	});
