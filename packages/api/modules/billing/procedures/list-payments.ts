import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
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
				stoppedAccount: z.boolean().optional(),
				freeAccount: z.boolean().optional(),
				amountMismatch: z
					.enum(["any", "overpaid", "underpaid"])
					.optional(),
				unreviewedOnly: z.boolean().optional(),
				noteCategory: z.string().optional(),
				receiptStatus: z.enum(["sent", "failed", "pending"]).optional(),
				groupName: z.string().optional(),
				search: z.string().optional(),
				dateFrom: z.string().datetime().optional(),
				dateTo: z.string().datetime().optional(),
				sortBy: z
					.enum(["paidAt", "paidAmount", "stoppedAccount"])
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
		if (input.stoppedAccount !== undefined) {
			where["stoppedAccount"] = input.stoppedAccount;
		}
		if (input.freeAccount !== undefined) {
			where["freeAccount"] = input.freeAccount;
		}
		if (input.unreviewedOnly) {
			where["reviewedAt"] = null;
			// Get IDs of amount-mismatch payments to include in unreviewedOnly filter
			const mismatchIdsForReview = await db.$queryRaw<{ id: string }[]>`
				SELECT p.id FROM "payment" p
				JOIN "customer" c ON c.id = p."customerId"
				WHERE p."organizationId" = ${input.organizationId}
				  AND p."freeAccount" = false
				  AND p."stoppedAccount" = false
				  AND ABS(p."paidAmount" - (p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount")) > 0.01
				  AND p."reviewedAt" IS NULL
			`;
			const mismatchIds = mismatchIdsForReview.map((r) => r.id);
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				{
					OR: [
						{ freeAccount: true },
						{ stoppedAccount: true },
						...(mismatchIds.length > 0
							? [{ id: { in: mismatchIds } }]
							: []),
					],
				},
			];
		}
		if (input.noteCategory) {
			where["noteCategory"] = input.noteCategory;
		}
		if (input.receiptStatus === "sent") {
			where["receiptSent"] = true;
		} else if (input.receiptStatus === "failed") {
			where["receiptSent"] = false;
			where["stoppedAccount"] = false;
			// Has at least one failed entry in activityLog
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				{
					NOT: { activityLog: { equals: [] } },
				},
			];
		} else if (input.receiptStatus === "pending") {
			where["receiptSent"] = false;
			where["stoppedAccount"] = false;
			where["activityLog"] = { equals: [] };
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
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				{
					OR: [
						{
							id: {
								contains: searchLower,
								mode: "insensitive" as const,
							},
						},
						{ customer: customerSearch },
					],
				},
			];
		} else if (Object.keys(customerWhere).length > 0) {
			where["customer"] = customerWhere;
		}

		// For amount mismatch, we need to get IDs via raw SQL then filter
		if (input.amountMismatch) {
			const direction =
				input.amountMismatch === "overpaid"
					? `AND p."paidAmount" > (p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount" + 0.01)`
					: input.amountMismatch === "underpaid"
						? `AND p."paidAmount" < (p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount" - 0.01)`
						: `AND ABS(p."paidAmount" - (p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount")) > 0.01`;

			const mismatchIds = await db.$queryRawUnsafe<{ id: string }[]>(
				`SELECT p.id FROM "payment" p
				JOIN "customer" c ON c.id = p."customerId"
				WHERE p."organizationId" = $1
				  AND p."freeAccount" = false
				  AND p."stoppedAccount" = false
				  ${direction}`,
				input.organizationId,
			);
			const ids = mismatchIds.map((r) => r.id);
			if (ids.length === 0) {
				return {
					payments: [],
					total: 0,
					page: input.page,
					pageSize: input.pageSize,
					totalPages: 0,
				};
			}
			where["id"] = { in: ids };
		}

		const [payments, total] = await Promise.all([
			db.payment.findMany({
				where,
				select: {
					id: true,
					accountPrice: true,
					paidAmount: true,
					discount: true,
					freeAccount: true,
					stoppedAccount: true,
					noteCategory: true,
					notes: true,
					receiptSent: true,
					activityLog: true,
					reviewedAt: true,
					paidAt: true,
					customer: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							username: true,
							mobile: true,
							phone: true,
							address: true,
							groupName: true,
							billingExpiresAt: true,
							iptvPrice: true,
							realIpPrice: true,
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
