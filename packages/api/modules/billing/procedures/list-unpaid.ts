import {
	getDealerScopeFilter,
	requirePermission,
	resolveCollectorScope,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	getMonthDateRange,
	resolveActiveBillingMonth,
	resolveBillingMonthId,
} from "../lib/resolve-month";

export const listUnpaidCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/unpaid",
		tags: ["Billing"],
		summary: "List unpaid customers (computed from payment records)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
			collectorId: z.string().optional(),
			groupName: z.string().optional(),
			excludeGroupName: z.string().optional(),
			search: z.string().optional(),
			expiryFrom: z.string().optional(),
			expiryTo: z.string().optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		// Default to the active billing month (latest unlocked), not the
		// current calendar month — the active month may be ahead of today.
		let year = input.year;
		let month = input.month;
		let billingMonthId: string | undefined;
		if (year == null || month == null) {
			const active = await resolveActiveBillingMonth(
				input.organizationId,
			);
			year = year ?? active.year;
			month = month ?? active.month;
			billingMonthId = active.id;
		} else {
			billingMonthId = await resolveBillingMonthId(
				input.organizationId,
				year,
				month,
			);
		}
		const monthRange = getMonthDateRange(year, month);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "ACTIVE",
			// Customers whose expiry falls within or before this billing month
			// (includes past-due customers from prior months)
			expiresAt: { lte: monthRange.lte },
			...getDealerScopeFilter(activeDealerId),
		};

		// Exclude customers who have a COLLECTED payment for this month
		if (billingMonthId) {
			where["payments"] = {
				none: {
					billingMonthId,
					status: "COLLECTED",
				},
			};
		}

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
			// Use OR to allow null groupNames through — Prisma's NOT excludes nulls
			const excludeFilter = {
				OR: [
					{ groupName: null },
					{
						NOT: {
							groupName: {
								equals: input.excludeGroupName,
								mode: "insensitive",
							},
						},
					},
				],
			};
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				excludeFilter,
			];
		}
		if (input.search) {
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				{
					OR: [
						{
							firstName: {
								contains: input.search,
								mode: "insensitive",
							},
						},
						{
							lastName: {
								contains: input.search,
								mode: "insensitive",
							},
						},
						{
							username: {
								contains: input.search,
								mode: "insensitive",
							},
						},
						{
							mobile: {
								contains: input.search,
								mode: "insensitive",
							},
						},
					],
				},
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

		// ── Accumulated debt enrichment ──────────────────────────
		const customerIds = customers.map((c) => c.id);

		const toMonthNum = (y: number, m: number) => y * 12 + m;
		const currentMonthNum = toMonthNum(year, month);

		type EnrichedCustomer = (typeof customers)[number] & {
			unpaidMonths: number;
			accumulatedDue: number;
			pastDueMonths: number;
			pastDueAmount: number;
		};

		let enrichedCustomers: EnrichedCustomer[];

		if (customerIds.length > 0) {
			const [allBillingMonths, paidPayments] = await Promise.all([
				db.billingMonth.findMany({
					where: { organizationId: input.organizationId },
					select: { id: true, year: true, month: true },
					orderBy: [{ year: "asc" }, { month: "asc" }],
				}),
				db.payment.findMany({
					where: {
						customerId: { in: customerIds },
						status: "COLLECTED",
					},
					select: { customerId: true, billingMonthId: true },
				}),
			]);

			const paidMap = new Map<string, Set<string>>();
			for (const p of paidPayments) {
				let set = paidMap.get(p.customerId);
				if (!set) {
					set = new Set();
					paidMap.set(p.customerId, set);
				}
				set.add(p.billingMonthId);
			}

			enrichedCustomers = customers.map((customer) => {
				const exp = customer.expiresAt
					? new Date(customer.expiresAt)
					: null;
				const accountPrice =
					customer.monthlyRate ?? customer.plan?.monthlyPrice ?? 0;
				const monthlyDue =
					accountPrice +
					(customer.iptvPrice ?? 0) +
					(customer.realIpPrice ?? 0) -
					(customer.discount ?? 0);

				if (!exp) {
					return {
						...customer,
						unpaidMonths: 1,
						accumulatedDue: monthlyDue,
						pastDueMonths: 0,
						pastDueAmount: 0,
					};
				}

				const expiryMonthNum = toMonthNum(
					exp.getFullYear(),
					exp.getMonth() + 1,
				);
				const paidIds = paidMap.get(customer.id) ?? new Set();

				let unpaidCount = 0;
				let pastDueCount = 0;

				for (const bm of allBillingMonths) {
					const bmNum = toMonthNum(bm.year, bm.month);
					if (bmNum < expiryMonthNum || bmNum > currentMonthNum) {
						continue;
					}
					if (!paidIds.has(bm.id)) {
						unpaidCount++;
						if (bmNum < currentMonthNum) {
							pastDueCount++;
						}
					}
				}

				if (unpaidCount === 0) {
					unpaidCount = 1;
				}

				return {
					...customer,
					unpaidMonths: unpaidCount,
					accumulatedDue: unpaidCount * monthlyDue,
					pastDueMonths: pastDueCount,
					pastDueAmount: pastDueCount * monthlyDue,
				};
			});
		} else {
			enrichedCustomers = [];
		}

		return {
			customers: enrichedCustomers,
			total,
			totalAmountDue,
			expiredCount,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
