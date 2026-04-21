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
	hasBilledInvoiceFilter,
} from "../lib/filters";
import {
	applyCollectorScope,
	fetchRelevantBillingMonths,
} from "../lib/queries";
import {
	getMonthDateRange,
	resolveYearMonth,
	yearMonthToNum,
} from "../lib/resolve-month";
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
		const currentMonthNum = yearMonthToNum(year, month);

		const relevantMonths = await fetchRelevantBillingMonths(
			input.organizationId,
			year,
			month,
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
			status: { in: BILLABLE_CUSTOMER_STATUSES },
			...EXCLUDE_FREE_GROUP,
			// Customers whose billing expiry falls within or before this billing month
			// (includes past-due customers from prior months)
			billingExpiresAt: { lte: monthRange.lte },
			// Drops dormant PENDING customers (iRadius stopped issuing invoices)
			// so they don't surface as synthetic one-month debt.
			...hasBilledInvoiceFilter(relevantMonths),
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

		// We need to filter out customers whose enrichment yields zero unpaid
		// months (dormant PENDING with only pre-expiry invoices — iRadius kept
		// the subscription row but stopped billing them). That decision
		// requires invoice-level per-customer data the SQL filter can't
		// correlate in Prisma's `where`, so we fetch the full eligible set
		// and paginate/aggregate in JS. Cap prevents runaway if the filter
		// ever mis-scopes on a very large org.
		const FETCH_CAP = 10_000;
		const customers = await db.customer.findMany({
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
			take: FETCH_CAP,
		});

		// ── Accumulated debt enrichment ──────────────────────────
		const customerIds = customers.map((c) => c.id);

		type EnrichedCustomer = (typeof customers)[number] & {
			unpaidMonths: number;
			accumulatedDue: number;
			pastDueMonths: number;
			pastDueAmount: number;
		};

		let enrichedCustomers: EnrichedCustomer[];

		if (customerIds.length > 0) {
			const [paidPayments, invoices] = await Promise.all([
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

				// Use UTC accessors: `billing_cycle.year/month` and
				// `customer_invoice.year/month` are TZ-naive integers that
				// match the timestamp's UTC value. With a non-UTC server TZ
				// (e.g. Asia/Beirut, UTC+3) `exp.getMonth()` shifts a date
				// like 2026-03-31T23:55:00Z forward to April, causing the
				// loop to skip March and miss the unpaid month.
				const expiryMonthNum = yearMonthToNum(
					exp.getUTCFullYear(),
					exp.getUTCMonth() + 1,
				);
				const paidIds = paidMap.get(customer.id) ?? new Set();
				const billed = billedMap.get(customer.id) ?? new Set();

				let unpaidCount = 0;
				let pastDueCount = 0;

				for (const bm of relevantMonths) {
					const bmNum = yearMonthToNum(bm.year, bm.month);
					if (bmNum < expiryMonthNum) {
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

		// Hide customers with nothing to collect (iRadius stopped billing
		// them, or their only in-window invoices are before expiry). They'd
		// otherwise show as "$0.00" rows and confuse the collector.
		const withDebt = enrichedCustomers.filter((c) => c.unpaidMonths > 0);

		const total = withDebt.length;
		const totalAmountDue = withDebt.reduce(
			(sum, c) => sum + c.accumulatedDue,
			0,
		);
		const now = new Date();
		const expiredCount = withDebt.filter(
			(c) => c.billingExpiresAt && new Date(c.billingExpiresAt) < now,
		).length;

		const skip = (input.page - 1) * input.pageSize;
		const pageCustomers = withDebt.slice(skip, skip + input.pageSize);

		return {
			customers: pageCustomers,
			total,
			totalAmountDue,
			expiredCount,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
