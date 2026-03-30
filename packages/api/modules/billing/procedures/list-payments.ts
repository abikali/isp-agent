import { requirePermission } from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { buildDateRangeFilter, customerSearchFilter } from "../lib/filters";
import { applyCollectorScope } from "../lib/queries";
import { paginationSchema } from "../lib/schemas";

export const listPayments = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/payments",
		tags: ["Billing"],
		summary: "List payments with pagination and filters",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				billingMonthId: z.string().optional(),
				collectorId: z.string().optional(),
				status: z
					.enum([PaymentStatus.COLLECTED, PaymentStatus.STOPPED])
					.optional(),
				groupName: z.string().optional(),
				search: z.string().optional(),
				dateFrom: z.string().datetime().optional(),
				dateTo: z.string().datetime().optional(),
				sortBy: z
					.enum(["paidAt", "paidAmount", "status"])
					.default("paidAt"),
				sortOrder: z.enum(["asc", "desc"]).default("desc"),
			})
			.merge(paginationSchema()),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};

		// Build customer sub-filter (dealer scope + groupName + search)
		const customerWhere: Record<string, unknown> = {
			dealerId: activeDealerId ?? null,
		};

		await applyCollectorScope(where, permCtx, input.collectorId);

		if (input.billingMonthId) {
			where["billingMonthId"] = input.billingMonthId;
		}
		if (input.status) {
			where["status"] = input.status;
		}
		if (input.groupName) {
			customerWhere["groupName"] = input.groupName;
		}
		const dateRange = buildDateRangeFilter(input.dateFrom, input.dateTo);
		if (dateRange) {
			where["paidAt"] = dateRange;
		}
		if (input.search) {
			const searchLower = input.search.toLowerCase();
			const customerSearch = {
				...customerWhere,
				...customerSearchFilter(input.search),
			};
			where["OR"] = [
				{ id: { contains: searchLower, mode: "insensitive" as const } },
				{ customer: customerSearch },
			];
		} else if (Object.keys(customerWhere).length > 0) {
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
					status: true,
					freeAccount: true,
					noteCategory: true,
					notes: true,
					receiptSent: true,
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
							plan: { select: { id: true, name: true } },
						},
					},
					collector: {
						select: { id: true, name: true },
					},
					billingMonth: {
						select: { year: true, month: true },
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
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
