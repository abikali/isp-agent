import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	iradiusResetMacAddress,
	iradiusSetExpiryAccount,
	iradiusSetIptvPrice,
	iradiusSetRecurringDiscount,
} from "../lib/iradius-api";

/**
 * Shared scaffolding for bulk iRadius admin actions:
 *
 *   1. Permission + dealer scope filter the candidate set,
 *   2. Skip customers without an iRadius `externalId` (counted as `skipped`),
 *   3. Apply the iRadius mutation row-by-row — the iRadius API stalls
 *      under parallel writes, and a single fanned-out failure would have
 *      to be reconciled per-customer anyway,
 *   4. On a successful iRadius write, mirror the same field to the local
 *      `customer` row so list/detail views stay in sync,
 *   5. Audit each touched customer individually.
 *
 * Returns per-customer outcomes so the UI can surface partial failures.
 * The serialised loop is intentional — see the bulk-set-status worker for
 * the same trade-off.
 */
async function runBulkIradiusAction<T>(opts: {
	customers: Array<{
		id: string;
		externalId: string | null;
		collectorId: string | null;
		username: string | null;
	}>;
	userId: string;
	organizationId: string;
	headers: Headers;
	mutate: (customer: {
		externalId: string | null;
		username?: string | null;
	}) => Promise<T>;
	localData: Prisma.CustomerUpdateInput;
}) {
	const auditContext = getAuditContextFromHeaders(opts.headers);
	let succeeded = 0;
	let skipped = 0;
	const failures: Array<{ id: string; reason: string }> = [];

	for (const customer of opts.customers) {
		if (!customer.externalId) {
			skipped++;
			continue;
		}
		try {
			await opts.mutate({
				externalId: customer.externalId,
				username: customer.username,
			});
			await db.customer.update({
				where: { id: customer.id },
				data: opts.localData,
			});
			customerAudit.updated(
				customer.id,
				opts.userId,
				opts.organizationId,
				auditContext,
			);
			succeeded++;
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Unknown error";
			logger.error("[Customer bulk iRadius action] Failed", {
				customerId: customer.id,
				reason,
			});
			failures.push({ id: customer.id, reason });
		}
	}

	return {
		succeeded,
		skipped,
		failed: failures.length,
		failures,
	};
}

async function loadBulkTargets(opts: {
	organizationId: string;
	userId: string;
	customerIds: string[];
}) {
	const { activeDealerId, iradiusDisabled } = await requirePermission(
		opts.organizationId,
		opts.userId,
		"customers",
		"update",
	);
	if (iradiusDisabled) {
		throw new ORPCError("BAD_REQUEST", {
			message: "iRadius is disabled for this organization",
		});
	}
	const customers = await db.customer.findMany({
		where: {
			id: { in: opts.customerIds },
			organizationId: opts.organizationId,
			...getDealerScopeFilter(activeDealerId),
		},
		select: {
			id: true,
			externalId: true,
			collectorId: true,
			username: true,
		},
	});
	if (customers.length === 0) {
		throw new ORPCError("NOT_FOUND", {
			message: "No accessible customers in this selection",
		});
	}
	return { customers };
}

// ─── Bulk reset MAC ────────────────────────────────────────────────────

export const bulkResetMacAddress = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-reset-mac",
		tags: ["Customers"],
		summary: "Reset MAC address in iRadius for a set of customers",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { customers } = await loadBulkTargets({
			organizationId: input.organizationId,
			userId: user.id,
			customerIds: input.customerIds,
		});
		return {
			...(await runBulkIradiusAction({
				customers,
				userId: user.id,
				organizationId: input.organizationId,
				headers,
				mutate: (customer) => iradiusResetMacAddress(customer),
				localData: { macAddress: null },
			})),
			requested: input.customerIds.length,
		};
	});

// ─── Bulk set discount ─────────────────────────────────────────────────

export const bulkSetDiscount = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-set-discount",
		tags: ["Customers"],
		summary: "Set recurring discount in iRadius for a set of customers",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
			discount: z.number().finite().min(0),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { customers } = await loadBulkTargets({
			organizationId: input.organizationId,
			userId: user.id,
			customerIds: input.customerIds,
		});
		return {
			...(await runBulkIradiusAction({
				customers,
				userId: user.id,
				organizationId: input.organizationId,
				headers,
				mutate: (customer) =>
					iradiusSetRecurringDiscount(customer, input.discount),
				localData: { discount: input.discount },
			})),
			requested: input.customerIds.length,
		};
	});

// ─── Bulk set IPTV price ───────────────────────────────────────────────

export const bulkSetIptvPrice = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-set-iptv-price",
		tags: ["Customers"],
		summary: "Set IPTV price in iRadius for a set of customers",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
			iptvPrice: z.number().finite().min(0),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { customers } = await loadBulkTargets({
			organizationId: input.organizationId,
			userId: user.id,
			customerIds: input.customerIds,
		});
		return {
			...(await runBulkIradiusAction({
				customers,
				userId: user.id,
				organizationId: input.organizationId,
				headers,
				mutate: (customer) =>
					iradiusSetIptvPrice(customer, input.iptvPrice),
				localData: { iptvPrice: input.iptvPrice },
			})),
			requested: input.customerIds.length,
		};
	});

// ─── Bulk set expiry date ──────────────────────────────────────────────

export const bulkSetExpiryDate = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-set-expiry-date",
		tags: ["Customers"],
		summary: "Set billing expiry date in iRadius for a set of customers",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
			// YYYY-MM-DD. Pass null to clear.
			expiryDate: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
				.nullable(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		// Match the single-customer set-expiry semantics: end-of-day,
		// tz-naive literal that iRadius accepts directly.
		const mysqlDateTime = input.expiryDate
			? `${input.expiryDate} 23:59:00`
			: null;
		const localDate = input.expiryDate
			? new Date(`${input.expiryDate}T23:59:00.000Z`)
			: null;

		const { customers } = await loadBulkTargets({
			organizationId: input.organizationId,
			userId: user.id,
			customerIds: input.customerIds,
		});
		return {
			...(await runBulkIradiusAction({
				customers,
				userId: user.id,
				organizationId: input.organizationId,
				headers,
				mutate: (customer) =>
					iradiusSetExpiryAccount(customer, mysqlDateTime),
				localData: { expiresAt: localDate },
			})),
			requested: input.customerIds.length,
		};
	});

// ─── Bulk change collector ─────────────────────────────────────────────

/**
 * Local-only — collector assignment is not mirrored to iRadius because
 * the iRadius `CollectorId` references an iRadius `User` and changing it
 * goes through `iradiusChangeCollector` per customer (a stalled remote
 * write here would block all 200 rows). The local-only update keeps the
 * bulk action snappy; admins should use the single-customer detail flow
 * if they need to push the new collector to iRadius too.
 */
export const bulkChangeCollector = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/bulk-change-collector",
		tags: ["Customers"],
		summary: "Assign a collector to a set of customers (local only)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerIds: z.array(z.string()).min(1).max(200),
			// `null` clears the collector assignment.
			collectorId: z.string().nullable(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		let collectorPayload: {
			id: string;
			name: string;
			phone: string | null;
		} | null = null;
		if (input.collectorId) {
			const collector = await db.employee.findFirst({
				where: {
					id: input.collectorId,
					organizationId: input.organizationId,
					status: "ACTIVE",
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true, name: true, phone: true },
			});
			if (!collector) {
				throw new ORPCError("NOT_FOUND", {
					message: "Collector not found or inactive",
				});
			}
			collectorPayload = collector;
		}

		const update = await db.customer.updateMany({
			where: {
				id: { in: input.customerIds },
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			data: collectorPayload
				? {
						collectorId: collectorPayload.id,
						collectorName: collectorPayload.name,
						collectorPhone: collectorPayload.phone ?? null,
					}
				: {
						collectorId: null,
						collectorName: null,
						collectorPhone: null,
					},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		// Audit at the org level — emitting one row per customer for an
		// updateMany would balloon the audit log with low-value entries.
		customerAudit.updated(
			"bulk",
			user.id,
			input.organizationId,
			auditContext,
		);

		return {
			succeeded: update.count,
			skipped: 0,
			failed: 0,
			failures: [] as Array<{ id: string; reason: string }>,
			requested: input.customerIds.length,
		};
	});
