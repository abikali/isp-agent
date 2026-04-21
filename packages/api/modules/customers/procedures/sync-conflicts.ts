import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db, dbRaw, Prisma } from "@repo/database";
import { type ConflictFields, deserializeValue } from "@repo/jobs/sync-fields";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDealerScopeWhere(activeDealerId: string | null) {
	if (activeDealerId) {
		return { customer: { dealerId: activeDealerId } };
	}
	return {};
}

/**
 * Resolve a single field across all matching conflicts.
 * Only marks the conflict as "resolved" if all its fields are now resolved.
 */
async function resolveByField(
	where: Record<string, unknown>,
	targetField: string,
	resolution: "keep_local" | "keep_remote",
	userId: string,
) {
	const conflicts = await db.syncConflict.findMany({
		where,
		include: { customer: { select: { id: true } } },
	});

	let resolved = 0;
	const resolvedAt = new Date();
	const BATCH_SIZE = 50;

	for (let i = 0; i < conflicts.length; i += BATCH_SIZE) {
		const batch = conflicts.slice(i, i + BATCH_SIZE);

		// dbRaw: resolution may write iRadius's status value back locally; we
		// must not re-trigger the customer status observer / iRadius push.
		await dbRaw.$transaction(async (tx) => {
			for (const conflict of batch) {
				const fields = conflict.fields as unknown as ConflictFields;
				const field = fields[targetField];
				if (!field || field.resolution !== null) {
					continue;
				}

				field.resolution = resolution;
				resolved++;

				const allResolved = Object.values(fields).every(
					(f) => f.resolution !== null,
				);

				if (resolution === "keep_remote") {
					await tx.customer.update({
						where: { id: conflict.customerId },
						data: {
							[targetField]: deserializeValue(
								field.remote,
								targetField,
							),
						},
					});
				}

				await tx.syncConflict.update({
					where: { id: conflict.id },
					data: {
						fields: fields as unknown as Prisma.InputJsonValue,
						...(allResolved
							? {
									status: "resolved",
									resolvedAt,
									resolvedById: userId,
								}
							: {}),
					},
				});
			}
		});
	}

	return { resolvedCount: resolved };
}

// ---------------------------------------------------------------------------
// List sync conflicts (paginated)
// ---------------------------------------------------------------------------

export const listSyncConflicts = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/iradius/sync-conflicts",
		tags: ["Customers"],
		summary: "List iRadius sync conflicts for admin resolution",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z
				.enum(["pending", "resolved", "all"])
				.optional()
				.default("pending"),
			/** Only return conflicts whose JSON `fields` has this key unresolved. */
			fieldName: z.string().optional(),
			page: z.number().int().min(1).optional().default(1),
			pageSize: z.number().int().min(1).max(200).optional().default(100),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const where: Prisma.SyncConflictWhereInput = {
			organizationId: input.organizationId,
			...(input.status !== "all" ? { status: input.status } : {}),
			...buildDealerScopeWhere(activeDealerId),
			...(input.fieldName
				? {
						fields: {
							path: [input.fieldName, "resolution"],
							equals: Prisma.JsonNull,
						},
					}
				: {}),
		};

		const [conflicts, totalCount] = await Promise.all([
			db.syncConflict.findMany({
				where,
				include: {
					customer: {
						select: {
							id: true,
							accountNumber: true,
							fullName: true,
							username: true,
							dealerId: true,
						},
					},
				},
				orderBy: { createdAt: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.syncConflict.count({ where }),
		]);

		return { conflicts, totalCount };
	});

// ---------------------------------------------------------------------------
// Resolve a single conflict (per-field resolutions)
// ---------------------------------------------------------------------------

export const resolveSyncConflict = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/sync-conflicts/resolve",
		tags: ["Customers"],
		summary: "Resolve field-level conflicts for a single customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			conflictId: z.string(),
			resolutions: z.record(
				z.string(),
				z.enum(["keep_local", "keep_remote"]),
			),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const conflict = await db.syncConflict.findUnique({
			where: { id: input.conflictId },
			include: {
				customer: { select: { id: true, dealerId: true } },
			},
		});

		if (
			!conflict ||
			conflict.organizationId !== input.organizationId ||
			conflict.status === "resolved"
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Conflict not found or already resolved",
			});
		}

		// Dealer scope check
		if (activeDealerId && conflict.customer.dealerId !== activeDealerId) {
			throw new ORPCError("FORBIDDEN", {
				message: "Customer is not in your dealer scope",
			});
		}

		const fields = conflict.fields as unknown as ConflictFields;
		const customerUpdate: Record<string, unknown> = {};

		// Apply resolutions to the conflict fields JSON
		for (const [fieldName, resolution] of Object.entries(
			input.resolutions,
		)) {
			const field = fields[fieldName];
			if (!field) {
				continue;
			}
			field.resolution = resolution;

			if (resolution === "keep_remote") {
				customerUpdate[fieldName] = deserializeValue(
					field.remote,
					fieldName,
				);
			}
		}

		// Check if all fields are now resolved
		const allResolved = Object.values(fields).every(
			(f) => f.resolution !== null,
		);

		// dbRaw: resolution may write iRadius's status value back locally; we
		// must not re-trigger the customer status observer / iRadius push.
		await dbRaw.$transaction(async (tx) => {
			// Update the conflict record
			await tx.syncConflict.update({
				where: { id: input.conflictId },
				data: {
					fields: fields as unknown as Prisma.InputJsonValue,
					...(allResolved
						? {
								status: "resolved",
								resolvedAt: new Date(),
								resolvedById: user.id,
							}
						: {}),
				},
			});

			// Apply customer field updates for "keep_remote" choices
			if (Object.keys(customerUpdate).length > 0) {
				await tx.customer.update({
					where: { id: conflict.customerId },
					data: customerUpdate,
				});
			}

			// Update operation resolved count if fully resolved
			if (allResolved) {
				await tx.iRadiusSyncOperation.update({
					where: { id: conflict.syncOperationId },
					data: { resolvedConflicts: { increment: 1 } },
				});
			}
		});

		return { resolved: allResolved };
	});

// ---------------------------------------------------------------------------
// Bulk resolve conflicts
// ---------------------------------------------------------------------------

export const bulkResolveSyncConflicts = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/sync-conflicts/bulk-resolve",
		tags: ["Customers"],
		summary: "Bulk resolve all pending sync conflicts",
	})
	.input(
		z.object({
			organizationId: z.string(),
			resolution: z.enum(["keep_local", "keep_remote"]),
			conflictIds: z.array(z.string()).optional(),
			fieldName: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const where = {
			organizationId: input.organizationId,
			status: "pending",
			...buildDealerScopeWhere(activeDealerId),
			...(input.conflictIds ? { id: { in: input.conflictIds } } : {}),
		};

		// When filtering by field, we resolve only that field within each conflict
		// (the conflict record stays "pending" if other fields remain unresolved)
		if (input.fieldName) {
			return resolveByField(
				where,
				input.fieldName,
				input.resolution,
				user.id,
			);
		}

		// Fast path for "keep_local" without field filter: batch mark all as resolved
		if (input.resolution === "keep_local") {
			const result = await db.syncConflict.updateMany({
				where,
				data: {
					status: "resolved",
					resolvedAt: new Date(),
					resolvedById: user.id,
				},
			});
			return { resolvedCount: result.count };
		}

		// "keep_remote" without field filter: apply all remote values
		const conflicts = await db.syncConflict.findMany({
			where,
			include: { customer: { select: { id: true } } },
		});

		if (conflicts.length === 0) {
			return { resolvedCount: 0 };
		}

		const resolvedAt = new Date();
		const BATCH_SIZE = 50;

		for (let i = 0; i < conflicts.length; i += BATCH_SIZE) {
			const batch = conflicts.slice(i, i + BATCH_SIZE);

			// dbRaw: bulk "keep_remote" resolution may write iRadius's status
			// value back locally; skip the customer status observer.
			await dbRaw.$transaction(async (tx) => {
				for (const conflict of batch) {
					const fields = conflict.fields as unknown as ConflictFields;
					const customerUpdate: Record<string, unknown> = {};

					for (const [fieldName, field] of Object.entries(fields)) {
						if (field.resolution !== null) {
							continue;
						}
						field.resolution = "keep_remote";
						customerUpdate[fieldName] = deserializeValue(
							field.remote,
							fieldName,
						);
					}

					await tx.syncConflict.update({
						where: { id: conflict.id },
						data: {
							fields: fields as unknown as Prisma.InputJsonValue,
							status: "resolved",
							resolvedAt,
							resolvedById: user.id,
						},
					});

					if (Object.keys(customerUpdate).length > 0) {
						await tx.customer.update({
							where: { id: conflict.customerId },
							data: customerUpdate,
						});
					}
				}
			});
		}

		return { resolvedCount: conflicts.length };
	});

// ---------------------------------------------------------------------------
// Get sync conflicts summary (for badge/notification)
// ---------------------------------------------------------------------------

export const getSyncConflictsSummary = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/iradius/sync-conflicts/summary",
		tags: ["Customers"],
		summary: "Get summary counts for sync conflicts",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const dealerScope = buildDealerScopeWhere(activeDealerId);

		const pendingWhere = {
			organizationId: input.organizationId,
			status: "pending",
			...dealerScope,
		};

		const [
			pendingCount,
			resolvedCount,
			pendingCustomers,
			pendingConflicts,
		] = await Promise.all([
			db.syncConflict.count({ where: pendingWhere }),
			db.syncConflict.count({
				where: {
					organizationId: input.organizationId,
					status: "resolved",
					...dealerScope,
				},
			}),
			db.syncConflict
				.groupBy({
					by: ["customerId"],
					where: pendingWhere,
				})
				.then((groups) => groups.length),
			// Load all pending conflict field keys to compute per-field counts
			db.syncConflict.findMany({
				where: pendingWhere,
				select: { fields: true },
			}),
		]);

		// Count unresolved fields across all conflicts
		const fieldCounts: Record<string, number> = {};
		for (const c of pendingConflicts) {
			const fields = c.fields as unknown as ConflictFields;
			for (const [fieldName, field] of Object.entries(fields)) {
				if (field.resolution === null) {
					fieldCounts[fieldName] = (fieldCounts[fieldName] ?? 0) + 1;
				}
			}
		}

		return {
			pendingCount,
			resolvedCount,
			affectedCustomers: pendingCustomers,
			fieldCounts,
		};
	});
