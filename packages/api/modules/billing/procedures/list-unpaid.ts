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
	excludeGroupFilter,
	NOT_VOIDED,
	PENDING_STOPPED_PAYMENT,
	SETTLED_PAYMENT,
} from "../lib/filters";
import {
	applyCollectorScope,
	fetchRelevantBillingMonths,
} from "../lib/queries";
import { resolveYearMonth, yearMonthToNum } from "../lib/resolve-month";
import { monthSpecSchema, paginationSchema } from "../lib/schemas";

/**
 * List customers with unpaid invoices, derived entirely from the
 * customer_invoice + payment tables. The invoice is the unit of truth:
 *   - existence of a row = customer was billed for that (year, month)
 *   - absence of a matching Payment = still owed
 *
 * Each invoice carries its own frozen `expiryDate`, set at generation time
 * from the customer's live iRadius expiry. The fresh-sync guard on
 * `toggleMonthLock` ensures these values reflect real billing deadlines
 * (not post-lock proactive extensions).
 */
export const listUnpaidCustomers = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/unpaid",
		tags: ["Billing"],
		summary: "List customers with unpaid invoices",
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
						"oldestUnpaidExpiry",
						"firstName",
						"groupName",
						"monthlyRate",
					])
					.default("oldestUnpaidExpiry"),
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

		const { year, month } = await resolveYearMonth(
			input.organizationId,
			input.year,
			input.month,
		);
		const currentMonthNum = yearMonthToNum(year, month);

		const relevantMonths = await fetchRelevantBillingMonths(
			input.organizationId,
			year,
			month,
		);

		if (relevantMonths.length === 0) {
			return {
				customers: [],
				total: 0,
				totalAmountDue: 0,
				expiredCount: 0,
				page: input.page,
				pageSize: input.pageSize,
				totalPages: 0,
			};
		}

		const relevantMonthIds = relevantMonths.map((m) => m.id);

		// Build SQL-side customer filter (cheap; pushes down to Postgres).
		// Excludes customers with a pending-stop payment in any relevant month —
		// those are in admin-review limbo and must be hidden from collectors
		// until admin approves or declines.
		const customerWhere: Record<string, unknown> = {
			status: { in: [...BILLABLE_CUSTOMER_STATUSES] },
			...getDealerScopeFilter(activeDealerId),
			NOT: {
				payments: {
					some: {
						billingMonthId: { in: relevantMonthIds },
						...PENDING_STOPPED_PAYMENT,
					},
				},
			},
		};
		if (input.groupName) {
			customerWhere["groupName"] = input.groupName;
		}
		if (input.excludeGroupName) {
			customerWhere["AND"] = [
				...((customerWhere["AND"] as unknown[]) ?? []),
				excludeGroupFilter(input.excludeGroupName),
			];
		}
		if (input.search) {
			customerWhere["AND"] = [
				...((customerWhere["AND"] as unknown[]) ?? []),
				{
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
						{
							phone: {
								contains: input.search,
								mode: "insensitive" as const,
							},
						},
					],
				},
			];
		}
		await applyCollectorScope(customerWhere, permCtx, input.collectorId);

		// Fetch invoices for relevant months, scoped to customers matching the
		// filter. Capped to keep the worst-case org bounded; 10k invoices across
		// ~12k billable customers and ~3 months is comfortably within range.
		const INVOICE_FETCH_CAP = 50_000;
		const invoices = await db.customerInvoice.findMany({
			where: {
				organizationId: input.organizationId,
				...NOT_VOIDED,
				OR: relevantMonths.map((m) => ({
					year: m.year,
					month: m.month,
				})),
				customer: customerWhere,
			},
			select: {
				customerId: true,
				year: true,
				month: true,
				total: true,
				totalWithTax: true,
				expiryDate: true,
				customer: {
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
						monthlyRate: true,
						discount: true,
						iptvPrice: true,
						realIpPrice: true,
						latitude: true,
						longitude: true,
						planId: true,
						expiresAt: true,
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
				},
			},
			take: INVOICE_FETCH_CAP,
		});

		if (invoices.length === 0) {
			return {
				customers: [],
				total: 0,
				totalAmountDue: 0,
				expiredCount: 0,
				page: input.page,
				pageSize: input.pageSize,
				totalPages: 0,
			};
		}

		// Build a (customerId, billingMonthId) paid set from Payment rows.
		const billingMonthIdByYM = new Map<string, string>();
		for (const bm of relevantMonths) {
			billingMonthIdByYM.set(`${bm.year}-${bm.month}`, bm.id);
		}
		const customerIds = [...new Set(invoices.map((i) => i.customerId))];
		const payments = await db.payment.findMany({
			where: {
				organizationId: input.organizationId,
				customerId: { in: customerIds },
				billingMonthId: { in: relevantMonthIds },
				...SETTLED_PAYMENT,
			},
			select: { customerId: true, billingMonthId: true },
		});
		const paidSet = new Map<string, Set<string>>();
		for (const p of payments) {
			let set = paidSet.get(p.customerId);
			if (!set) {
				set = new Set();
				paidSet.set(p.customerId, set);
			}
			set.add(p.billingMonthId);
		}

		// Aggregate unpaid invoices per customer.
		type Customer = (typeof invoices)[number]["customer"];
		interface UnpaidRow {
			customer: Customer;
			monthlyDue: number;
			unpaidMonths: number;
			accumulatedDue: number;
			pastDueMonths: number;
			pastDueAmount: number;
			oldestUnpaidExpiry: Date | null;
		}
		const byCustomer = new Map<string, UnpaidRow>();
		for (const inv of invoices) {
			const billingMonthId = billingMonthIdByYM.get(
				`${inv.year}-${inv.month}`,
			);
			if (!billingMonthId) {
				continue;
			}
			if (paidSet.get(inv.customerId)?.has(billingMonthId)) {
				continue;
			}
			const amount = inv.totalWithTax > 0 ? inv.totalWithTax : inv.total;
			let row = byCustomer.get(inv.customerId);
			if (!row) {
				row = {
					customer: inv.customer,
					monthlyDue: customerMonthlyDue(inv.customer),
					unpaidMonths: 0,
					accumulatedDue: 0,
					pastDueMonths: 0,
					pastDueAmount: 0,
					oldestUnpaidExpiry: null,
				};
				byCustomer.set(inv.customerId, row);
			}
			row.unpaidMonths++;
			row.accumulatedDue += amount;
			const invMonthNum = yearMonthToNum(inv.year, inv.month);
			if (invMonthNum < currentMonthNum) {
				row.pastDueMonths++;
				row.pastDueAmount += amount;
			}
			if (
				inv.expiryDate &&
				(!row.oldestUnpaidExpiry ||
					inv.expiryDate < row.oldestUnpaidExpiry)
			) {
				row.oldestUnpaidExpiry = inv.expiryDate;
			}
		}

		let rows = Array.from(byCustomer.values());

		// Expiry-range filter now matches against the oldest unpaid invoice.
		if (input.expiryFrom || input.expiryTo) {
			const from = input.expiryFrom ? new Date(input.expiryFrom) : null;
			const to = input.expiryTo ? new Date(input.expiryTo) : null;
			if (to) {
				to.setHours(23, 59, 59, 999);
			}
			rows = rows.filter((r) => {
				if (!r.oldestUnpaidExpiry) {
					return false;
				}
				if (from && r.oldestUnpaidExpiry < from) {
					return false;
				}
				if (to && r.oldestUnpaidExpiry > to) {
					return false;
				}
				return true;
			});
		}

		// Sort.
		const dir = input.sortOrder === "asc" ? 1 : -1;
		rows.sort((a, b) => {
			if (input.sortBy === "firstName") {
				const av = a.customer.firstName ?? "";
				const bv = b.customer.firstName ?? "";
				return av.localeCompare(bv) * dir;
			}
			if (input.sortBy === "groupName") {
				const av = a.customer.groupName ?? "";
				const bv = b.customer.groupName ?? "";
				return av.localeCompare(bv) * dir;
			}
			if (input.sortBy === "monthlyRate") {
				return (a.monthlyDue - b.monthlyDue) * dir;
			}
			const at =
				a.oldestUnpaidExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
			const bt =
				b.oldestUnpaidExpiry?.getTime() ?? Number.MAX_SAFE_INTEGER;
			return (at - bt) * dir;
		});

		const total = rows.length;
		const totalAmountDue = rows.reduce(
			(sum, r) => sum + r.accumulatedDue,
			0,
		);
		const now = new Date();
		const expiredCount = rows.filter(
			(r) => r.oldestUnpaidExpiry && r.oldestUnpaidExpiry < now,
		).length;

		const skip = (input.page - 1) * input.pageSize;
		const pageRows = rows.slice(skip, skip + input.pageSize).map((r) => ({
			...r.customer,
			monthlyDue: r.monthlyDue,
			unpaidMonths: r.unpaidMonths,
			accumulatedDue: r.accumulatedDue,
			pastDueMonths: r.pastDueMonths,
			pastDueAmount: r.pastDueAmount,
			oldestUnpaidExpiry: r.oldestUnpaidExpiry,
		}));

		return {
			customers: pageRows,
			total,
			totalAmountDue,
			expiredCount,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
