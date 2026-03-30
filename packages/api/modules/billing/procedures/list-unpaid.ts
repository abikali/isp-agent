import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { customerMonthlyDue } from "../lib/calculations";
import {
	customerSearchFilter,
	EXCLUDE_FREE_GROUP,
	excludeGroupFilter,
} from "../lib/filters";
import { applyCollectorScope } from "../lib/queries";
import { getMonthDateRange, resolveYearMonth } from "../lib/resolve-month";
import { monthSpecSchema, paginationSchema } from "../lib/schemas";

export const listUnpaidCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/unpaid",
		tags: ["Billing"],
		summary: "List unpaid customers (computed from payment records)",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				collectorId: z.string().optional(),
				groupName: z.string().optional(),
				excludeGroupName: z.string().optional(),
				search: z.string().optional(),
				expiryFrom: z.string().optional(),
				expiryTo: z.string().optional(),
			})
			.merge(monthSpecSchema)
			.merge(paginationSchema(50)),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const { year, month, billingMonthId } = await resolveYearMonth(
			input.organizationId,
			input.year,
			input.month,
		);
		const monthRange = getMonthDateRange(year, month);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: "ACTIVE",
			...EXCLUDE_FREE_GROUP,
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

		await applyCollectorScope(where, permCtx, input.collectorId);
		if (input.groupName) {
			where["groupName"] = input.groupName;
		}
		if (input.excludeGroupName) {
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				excludeGroupFilter(input.excludeGroupName),
			];
		}
		if (input.search) {
			where["AND"] = [
				...((where["AND"] as unknown[]) ?? []),
				customerSearchFilter(input.search),
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

		// Same formula as customerMonthlyDue() but applied to aggregate sums.
		// Mathematically equivalent: sum(a+b+c-d) = sum(a)+sum(b)+sum(c)-sum(d)
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
				const monthlyDue = customerMonthlyDue(customer);

				if (!exp) {
					return {
						...customer,
						monthlyDue,
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
					monthlyDue,
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
