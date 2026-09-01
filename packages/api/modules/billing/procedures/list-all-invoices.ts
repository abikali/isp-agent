import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { assignmentFilterValue } from "../lib/filters";
import {
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
	monthSettled,
} from "../lib/settlement";

/**
 * Org-wide invoice list with filters, search, sort, pagination.
 * Mirrors the shape of list-payments for consistency with the UI.
 *
 * Paid/unpaid is settlement-derived (lib/settlement.ts): a month counts as
 * paid only when its payments cover the frozen invoice total — keyed on
 * (customer, billing month) so legacy-imported payments with no invoice link
 * still settle their months, and a $0 stopped row no longer paints an
 * invoice green. Prisma can't compare a payment sum against a related
 * invoice column, so the paid/unpaid filter fetches slim candidate rows and
 * resolves the arithmetic in JS before paginating.
 */

const PAID_FILTER_FETCH_CAP = 200_000;

export const listAllInvoices = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/invoices",
		tags: ["Billing"],
		summary: "List all invoices (org-wide) with filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
			search: z.string().optional(),
			groupName: z.string().optional(),
			status: z.enum(["all", "paid", "unpaid", "voided"]).default("all"),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum([
					"invoiceDate",
					"total",
					"totalWithTax",
					"paid",
					"expiryDate",
				])
				.default("invoiceDate"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.year !== undefined) {
			where["year"] = input.year;
		}
		if (input.month !== undefined) {
			where["month"] = input.month;
		}

		const customerFilter: Record<string, unknown> = {
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.groupName) {
			customerFilter["groupName"] = assignmentFilterValue(
				input.groupName,
			);
		}
		if (input.search) {
			customerFilter["OR"] = [
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
					accountNumber: {
						contains: input.search,
						mode: "insensitive" as const,
					},
				},
			];
		}
		if (Object.keys(customerFilter).length > 0) {
			where["customer"] = customerFilter;
		}

		const billingMonths = await db.billingMonth.findMany({
			where: { organizationId: input.organizationId },
			select: { id: true, year: true, month: true },
		});
		const monthIdByYM = new Map(
			billingMonths.map((m) => [`${m.year}-${m.month}`, m.id]),
		);

		const pageSelect = {
			id: true,
			customerId: true,
			year: true,
			month: true,
			invoiceDate: true,
			expiryDate: true,
			accountPrice: true,
			iptvPrice: true,
			realIpPrice: true,
			total: true,
			discount: true,
			tax: true,
			totalWithTax: true,
			note: true,
			voidedAt: true,
			voidReason: true,
			createdAt: true,
			customer: {
				select: {
					id: true,
					accountNumber: true,
					firstName: true,
					lastName: true,
					username: true,
					mobile: true,
					phone: true,
				},
			},
			payments: {
				select: {
					id: true,
					paidAmount: true,
					discount: true,
					freeAccount: true,
					stoppedAccount: true,
					debtAccount: true,
					paidAt: true,
					collector: { select: { id: true, name: true } },
				},
				orderBy: { paidAt: "asc" as const },
			},
		};

		let pageInvoices: Array<Record<string, unknown>>;
		let total: number;

		if (input.status === "paid" || input.status === "unpaid") {
			// Settlement filter: fetch slim candidates, settle in JS, then
			// hydrate only the requested page.
			const slim = await db.customerInvoice.findMany({
				where: { ...where, voidedAt: null },
				select: {
					id: true,
					customerId: true,
					year: true,
					month: true,
					invoiceDate: true,
					expiryDate: true,
					total: true,
					totalWithTax: true,
				},
				take: PAID_FILTER_FETCH_CAP,
			});
			const involvedMonthIds = [
				...new Set(
					slim
						.map((i) => monthIdByYM.get(`${i.year}-${i.month}`))
						.filter((id): id is string => !!id),
				),
			];
			// Org-wide coverage for the involved months — the payment table is
			// small (~15k rows), while an `in` list of every candidate
			// customerId would blow the bind-parameter budget.
			const coverage = await fetchCoverageMap(
				db,
				input.organizationId,
				involvedMonthIds,
			);
			const wantPaid = input.status === "paid";
			const matching = slim.filter((inv) => {
				const monthId = monthIdByYM.get(`${inv.year}-${inv.month}`);
				const settled = monthId
					? monthSettled(
							invoiceAmount(inv),
							coverage.get(coverageKey(inv.customerId, monthId)),
						)
					: false;
				return settled === wantPaid;
			});

			const dir = input.sortOrder === "asc" ? 1 : -1;
			const sortKey = input.sortBy;
			matching.sort((a, b) => {
				if (sortKey === "invoiceDate") {
					return (
						(a.invoiceDate.getTime() - b.invoiceDate.getTime()) *
						dir
					);
				}
				if (sortKey === "expiryDate") {
					const at = a.expiryDate?.getTime() ?? 0;
					const bt = b.expiryDate?.getTime() ?? 0;
					return (at - bt) * dir;
				}
				if (sortKey === "total") {
					return (a.total - b.total) * dir;
				}
				// "paid" sorting is meaningless inside a single-status filter;
				// fall through to totalWithTax ordering for stability.
				return (a.totalWithTax - b.totalWithTax) * dir;
			});

			total = matching.length;
			const pageIds = matching
				.slice(
					(input.page - 1) * input.pageSize,
					input.page * input.pageSize,
				)
				.map((i) => i.id);
			const rows = await db.customerInvoice.findMany({
				where: { id: { in: pageIds } },
				select: pageSelect,
			});
			const orderIndex = new Map(pageIds.map((id, i) => [id, i]));
			rows.sort(
				(a, b) =>
					(orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
			);
			pageInvoices = rows;
		} else {
			if (input.status === "voided") {
				where["voidedAt"] = { not: null };
			}
			const [rows, count] = await Promise.all([
				db.customerInvoice.findMany({
					where,
					select: pageSelect,
					orderBy:
						input.sortBy === "paid"
							? // Approximation: group invoices with payment rows
								// together; the badge itself is settlement-derived.
								{ payments: { _count: input.sortOrder } }
							: { [input.sortBy]: input.sortOrder },
					skip: (input.page - 1) * input.pageSize,
					take: input.pageSize,
				}),
				db.customerInvoice.count({ where }),
			]);
			pageInvoices = rows;
			total = count;
		}

		// Derive settlement for the page rows.
		const pageMonthIds = [
			...new Set(
				pageInvoices
					.map((i) => monthIdByYM.get(`${i["year"]}-${i["month"]}`))
					.filter((id): id is string => !!id),
			),
		];
		const pageCustomerIds = [
			...new Set(pageInvoices.map((i) => i["customerId"] as string)),
		];
		const pageCoverage =
			pageMonthIds.length > 0
				? await fetchCoverageMap(
						db,
						input.organizationId,
						pageMonthIds,
						pageCustomerIds,
					)
				: new Map();

		const invoices = pageInvoices.map((inv) => {
			const monthId = monthIdByYM.get(`${inv["year"]}-${inv["month"]}`);
			const cov = monthId
				? pageCoverage.get(
						coverageKey(inv["customerId"] as string, monthId),
					)
				: undefined;
			const amount = invoiceAmount(
				inv as { total: number; totalWithTax: number },
			);
			return {
				...inv,
				paid: monthSettled(amount, cov) && inv["voidedAt"] === null,
				paidTotal: cov?.covered ?? 0,
				remaining: monthRemaining(amount, cov),
			};
		});

		return {
			invoices,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
