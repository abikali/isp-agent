import {
	NO_DEALER,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db, PaymentStatus } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listPayments = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/payments",
		tags: ["Billing"],
		summary: "List payments with pagination and filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingCycleId: z.string().optional(),
			collectorId: z.string().optional(),
			status: z
				.enum([
					PaymentStatus.PENDING,
					PaymentStatus.PROCESSED,
					PaymentStatus.PARTIAL,
					PaymentStatus.STOPPED,
				])
				.optional(),
			groupName: z.string().optional(),
			search: z.string().optional(),
			dateFrom: z.string().datetime().optional(),
			dateTo: z.string().datetime().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum(["paidAt", "paidAmount", "status"])
				.default("paidAt"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
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
			dealerId: activeDealerId ?? NO_DEALER,
		};

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && employeeId) {
			where["collectorId"] = employeeId;
		} else if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}

		if (input.billingCycleId) {
			where["billingCycleId"] = input.billingCycleId;
		}
		if (input.status) {
			where["status"] = input.status;
		}
		if (input.groupName) {
			customerWhere["groupName"] = input.groupName;
		}
		if (input.dateFrom || input.dateTo) {
			const paidAt: Record<string, unknown> = {};
			if (input.dateFrom) {
				paidAt["gte"] = new Date(input.dateFrom);
			}
			if (input.dateTo) {
				paidAt["lte"] = new Date(input.dateTo);
			}
			where["paidAt"] = paidAt;
		}
		if (input.search) {
			// Search by payment ID or customer fields
			const searchLower = input.search.toLowerCase();
			const customerSearch = {
				...customerWhere,
				OR: [
					{
						firstName: {
							contains: input.search,
							mode: "insensitive" as const,
						},
					},
					{
						lastName: {
							contains: input.search,
							mode: "insensitive" as const,
						},
					},
					{
						username: {
							contains: input.search,
							mode: "insensitive" as const,
						},
					},
					{
						mobile: {
							contains: input.search,
							mode: "insensitive" as const,
						},
					},
				],
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
					stoppedAccount: true,
					noteCategory: true,
					notes: true,
					receiptSent: true,
					paidAt: true,
					processedAt: true,
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
					processedBy: {
						select: { id: true, name: true },
					},
					billingCycle: {
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
