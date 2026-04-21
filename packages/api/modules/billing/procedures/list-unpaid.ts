import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { customerMonthlyDue } from "../lib/calculations";
import {
	BILLABLE_CUSTOMER_STATUSES,
	customerSearchFilter,
	EXCLUDE_FREE_GROUP,
	EXCLUDE_STOPPED,
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
				sortBy: z
					.enum([
						"billingExpiresAt",
						"firstName",
						"groupName",
						"monthlyRate",
					])
					.default("billingExpiresAt"),
				sortOrder: z.enum(["asc", "desc"]).default("asc"),
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
			status: { in: BILLABLE_CUSTOMER_STATUSES },
			...EXCLUDE_FREE_GROUP,
			// Customers whose billing expiry falls within or before this billing month
			// (includes past-due customers from prior months)
			billingExpiresAt: { lte: monthRange.lte },
			...getDealerScopeFilter(activeDealerId),
		};

		// Exclude customers who have any payment for this month
		if (billingMonthId) {
			where["payments"] = {
				none: {
					billingMonthId,
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
			const billingExpiresAt: Record<string, unknown> = {};
			if (input.expiryFrom) {
				billingExpiresAt["gte"] = new Date(input.expiryFrom);
			}
			if (input.expiryTo) {
				const to = new Date(input.expiryTo);
				to.setHours(23, 59, 59, 999);
				billingExpiresAt["lte"] = to;
			}
			where["billingExpiresAt"] = billingExpiresAt;
		}

		const [customers, total, aggregates, expiredCount] = await Promise.all([
			db.customer.findMany({
				where,
				select: {
					id: true,
					externalId: true,
					accountNumber: true,
					firstName: true,
					lastName: true,
					username: true,
					mobile: true,
					phone: true,
					phones: true,
					address: true,
					groupName: true,
					billingExpiresAt: true,
					monthlyRate: true,
					discount: true,
					iptvPrice: true,
					realIpPrice: true,
					latitude: true,
					longitude: true,
					planId: true,
					plan: {
						select: {
							id: true,
							name: true,
							monthlyPrice: true,
							externalId: true,
						},
					},
					collector: { select: { id: true, name: true } },
					dealer: { select: { id: true, name: true } },
					station: { select: { id: true, name: true } },
				},
				orderBy: { [input.sortBy]: input.sortOrder },
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
			db.customer.count({
				where: { ...where, billingExpiresAt: { lt: new Date() } },
			}),
		]);

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
			const [allBillingMonths, paidPayments, invoices] =
				await Promise.all([
					db.billingMonth.findMany({
						where: { organizationId: input.organizationId },
						select: { id: true, year: true, month: true },
						orderBy: [{ year: "asc" }, { month: "asc" }],
					}),
					db.payment.findMany({
						where: {
							customerId: { in: customerIds },
							...EXCLUDE_STOPPED,
						},
						select: { customerId: true, billingMonthId: true },
					}),
					db.customerInvoice.findMany({
						where: {
							customerId: { in: customerIds },
							// Loop below only consults months ≤ (year, month); skip
							// any future invoices to keep the row count bounded.
							OR: [
								{ year: { lt: year } },
								{ year, month: { lte: month } },
							],
						},
						select: { customerId: true, year: true, month: true },
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

			// A customer is only "owed" for months they were actually billed.
			// Months with no customer_invoice row = stopped periods; skip them
			// so reactivated customers aren't counted as owing for months iRadius
			// never billed.
			const billedMap = new Map<string, Set<string>>();
			for (const inv of invoices) {
				let set = billedMap.get(inv.customerId);
				if (!set) {
					set = new Set();
					billedMap.set(inv.customerId, set);
				}
				set.add(`${inv.year}-${inv.month}`);
			}

			enrichedCustomers = customers.map((customer) => {
				const exp = customer.billingExpiresAt
					? new Date(customer.billingExpiresAt)
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
				const billed = billedMap.get(customer.id) ?? new Set();

				let unpaidCount = 0;
				let pastDueCount = 0;

				for (const bm of allBillingMonths) {
					const bmNum = toMonthNum(bm.year, bm.month);
					if (bmNum < expiryMonthNum || bmNum > currentMonthNum) {
						continue;
					}
					if (!billed.has(`${bm.year}-${bm.month}`)) {
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
