import {
	getDealerScopeFilter,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listUnpaidCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/unpaid",
		tags: ["Billing"],
		summary: "List unpaid customers, optionally filtered by collector",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string().optional(),
			groupName: z.string().optional(),
			excludeGroupName: z.string().optional(),
			search: z.string().optional(),
			expiryFrom: z.string().optional(),
			expiryTo: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
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
			paidCurrentCycle: false,
			status: "ACTIVE",
			...getDealerScopeFilter(activeDealerId),
		};

		const { scope, employeeId } = await resolveCollectorScope(permCtx);
		if (scope === "own" && employeeId) {
			where["collectorId"] = employeeId;
		} else if (input.collectorId) {
			where["collectorId"] = input.collectorId;
		}
		if (input.groupName) {
			where["groupName"] = input.groupName;
		}
		if (input.excludeGroupName) {
			where["NOT"] = {
				groupName: {
					equals: input.excludeGroupName,
					mode: "insensitive",
				},
			};
		}
		if (input.search) {
			where["OR"] = [
				{ firstName: { contains: input.search, mode: "insensitive" } },
				{ lastName: { contains: input.search, mode: "insensitive" } },
				{ username: { contains: input.search, mode: "insensitive" } },
				{ mobile: { contains: input.search, mode: "insensitive" } },
			];
		}
		if (input.expiryFrom || input.expiryTo) {
			const expiresAt: Record<string, unknown> = {};
			if (input.expiryFrom) {
				expiresAt["gte"] = new Date(input.expiryFrom);
			}
			if (input.expiryTo) {
				expiresAt["lte"] = new Date(input.expiryTo);
			}
			where["expiresAt"] = expiresAt;
		}

		const [customers, total, aggregates] = await Promise.all([
			db.customer.findMany({
				where,
				select: {
					id: true,
					accountNumber: true,
					firstName: true,
					lastName: true,
					username: true,
					mobile: true,
					phone: true,
					address: true,
					groupName: true,
					expiresAt: true,
					monthlyRate: true,
					discount: true,
					iptvPrice: true,
					realIpPrice: true,
					latitude: true,
					longitude: true,
					plan: {
						select: { id: true, name: true, monthlyPrice: true },
					},
					collector: { select: { id: true, name: true } },
					dealer: { select: { id: true, name: true } },
					station: { select: { id: true, name: true } },
				},
				orderBy: { expiresAt: "asc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customer.count({ where }),
			db.customer.aggregate({
				where,
				_sum: {
					monthlyRate: true,
					iptvPrice: true,
					realIpPrice: true,
					discount: true,
				},
				_count: {
					_all: true,
				},
			}),
		]);

		// Count expired customers matching the same filters
		const expiredCount = await db.customer.count({
			where: {
				...where,
				expiresAt: { lt: new Date() },
			},
		});

		const totalAmountDue =
			(aggregates._sum.monthlyRate ?? 0) +
			(aggregates._sum.iptvPrice ?? 0) +
			(aggregates._sum.realIpPrice ?? 0) -
			(aggregates._sum.discount ?? 0);

		return {
			customers,
			total,
			totalAmountDue,
			expiredCount,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
