import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { z } from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Unified activity timeline for the customer workspace.
 *
 * Merges five sources of customer history into one chronological feed:
 *   - payments received
 *   - invoices generated
 *   - location requests
 *   - tasks linked to the customer
 *   - audit log entries (resource = "customer", id = customerId)
 *
 * Returns items sorted by `occurredAt desc`. Each item has a stable shape
 * so the workspace can render the feed generically and filter by type.
 *
 * Pagination is offset-based (cursors would require merge cursor logic
 * across five sources). Acceptable because the feed is typically scanned
 * top-down and rarely paged past a few pages.
 */

const TYPE_SCHEMA = z.enum([
	"payment",
	"invoice",
	"location_request",
	"task",
	"audit",
]);

export const getCustomerActivity = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/{customerId}/activity",
		tags: ["Customers"],
		summary: "Get the unified activity timeline for a customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			limit: z.number().min(1).max(100).default(40),
			types: z.array(TYPE_SCHEMA).optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const wantedTypes = new Set(
			input.types ?? [
				"payment",
				"invoice",
				"location_request",
				"task",
				"audit",
			],
		);
		const perSource = Math.max(10, Math.ceil(input.limit * 1.5));
		const baseCustomerWhere = {
			organizationId: input.organizationId,
			customerId: input.customerId,
		};

		const [payments, invoices, locationRequests, tasks, auditEntries] =
			await Promise.all([
				wantedTypes.has("payment")
					? db.payment.findMany({
							where: baseCustomerWhere,
							orderBy: { paidAt: "desc" },
							take: perSource,
							select: {
								id: true,
								paidAt: true,
								paidAmount: true,
								accountPrice: true,
								discount: true,
								status: true,
								notes: true,
								collector: { select: { name: true } },
								billingMonth: {
									select: { year: true, month: true },
								},
							},
						})
					: Promise.resolve([]),
				wantedTypes.has("invoice")
					? db.customerInvoice.findMany({
							where: baseCustomerWhere,
							orderBy: { invoiceDate: "desc" },
							take: perSource,
							select: {
								id: true,
								invoiceDate: true,
								year: true,
								month: true,
								total: true,
								voidedAt: true,
								payment: { select: { id: true } },
							},
						})
					: Promise.resolve([]),
				wantedTypes.has("location_request")
					? db.locationRequest.findMany({
							where: baseCustomerWhere,
							orderBy: { createdAt: "desc" },
							take: perSource,
							select: {
								id: true,
								createdAt: true,
								completedAt: true,
								expiresAt: true,
							},
						})
					: Promise.resolve([]),
				wantedTypes.has("task")
					? db.task.findMany({
							where: {
								organizationId: input.organizationId,
								customerId: input.customerId,
							},
							orderBy: { createdAt: "desc" },
							take: perSource,
							select: {
								id: true,
								createdAt: true,
								title: true,
								status: true,
								priority: true,
								category: true,
							},
						})
					: Promise.resolve([]),
				wantedTypes.has("audit")
					? db.auditLog.findMany({
							where: {
								organizationId: input.organizationId,
								resourceType: "customer",
								resourceId: input.customerId,
							},
							orderBy: { createdAt: "desc" },
							take: perSource,
							select: {
								id: true,
								createdAt: true,
								action: true,
								metadata: true,
								user: { select: { id: true, name: true } },
							},
						})
					: Promise.resolve([]),
			]);

		type ActivityItem = {
			type: z.infer<typeof TYPE_SCHEMA>;
			id: string;
			occurredAt: Date;
			title: string;
			detail: string | null;
			actor: string | null;
			meta: Record<string, unknown>;
		};

		const items: ActivityItem[] = [];

		for (const p of payments) {
			items.push({
				type: "payment",
				id: p.id,
				occurredAt: p.paidAt,
				title: `Payment $${p.paidAmount.toFixed(2)} received`,
				detail: null,
				actor: p.collector?.name ?? null,
				meta: {
					accountPrice: p.accountPrice,
					discount: p.discount,
					status: p.status,
					notes: p.notes,
					month: p.billingMonth
						? `${p.billingMonth.year}-${String(p.billingMonth.month).padStart(2, "0")}`
						: null,
				},
			});
		}

		for (const inv of invoices) {
			// Paid ⟺ a non-voided payment exists (single source of truth).
			const isPaid = inv.payment !== null && inv.voidedAt === null;
			items.push({
				type: "invoice",
				id: inv.id,
				occurredAt: inv.invoiceDate,
				title: `Invoice for ${inv.year}-${String(inv.month).padStart(2, "0")}`,
				detail: inv.voidedAt ? "Voided" : isPaid ? "Paid" : "Unpaid",
				actor: null,
				meta: {
					total: inv.total,
					paid: isPaid,
					voided: !!inv.voidedAt,
				},
			});
		}

		for (const lr of locationRequests) {
			items.push({
				type: "location_request",
				id: lr.id,
				occurredAt: lr.createdAt,
				title: lr.completedAt
					? "Location received"
					: "Location request sent",
				detail: lr.completedAt
					? null
					: lr.expiresAt < new Date()
						? "Expired"
						: "Awaiting customer",
				actor: null,
				meta: {
					completed: !!lr.completedAt,
				},
			});
		}

		for (const t of tasks) {
			items.push({
				type: "task",
				id: t.id,
				occurredAt: t.createdAt,
				title: t.title,
				detail: [t.status, t.priority, t.category]
					.filter(Boolean)
					.join(" · "),
				actor: null,
				meta: {
					status: t.status,
					priority: t.priority,
					category: t.category,
				},
			});
		}

		for (const a of auditEntries) {
			items.push({
				type: "audit",
				id: a.id,
				occurredAt: a.createdAt,
				title: a.action.replace(/_/g, " "),
				detail: null,
				actor: a.user?.name ?? null,
				meta: (a.metadata as Record<string, unknown>) ?? {},
			});
		}

		items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

		return {
			items: items.slice(0, input.limit),
			hasMore: items.length > input.limit,
		};
	});
