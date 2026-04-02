import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queryIRadius, withIRadiusConnection } from "@repo/database/iradius";
import {
	buildCustomerDataFromRow,
	buildEmployeeDataFromRow,
	CUSTOMER_FROM_CLAUSE,
	CUSTOMER_SELECT_COLUMNS,
	EMPLOYEE_SELECT_COLUMNS,
	type SyncLookupMaps,
	serializeValue,
	valuesEqual,
} from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function buildLocalLookupMaps(
	organizationId: string,
): Promise<SyncLookupMaps> {
	const [plans, stations, aps, nases, employees, dealers, orgRecord] =
		await Promise.all([
			db.servicePlan.findMany({
				where: { organizationId, externalId: { not: null } },
				select: { id: true, externalId: true, name: true },
			}),
			db.station.findMany({
				where: { organizationId, externalId: { not: null } },
				select: { id: true, externalId: true },
			}),
			db.accessPoint.findMany({
				where: { organizationId, externalId: { not: null } },
				select: { id: true, externalId: true },
			}),
			db.ispNas.findMany({
				where: { organizationId },
				select: { id: true, host: true },
			}),
			db.employee.findMany({
				where: { organizationId, externalId: { not: null } },
				select: { id: true, externalId: true },
			}),
			db.ispDealer.findMany({
				where: { organizationId, externalId: { not: null } },
				select: { id: true, externalId: true },
			}),
			db.organization.findUnique({
				where: { id: organizationId },
				select: { activeDealerId: true },
			}),
		]);

	const planMap = new Map<number, string>();
	const planNames = new Map<number, string>();
	for (const p of plans) {
		if (!p.externalId) {
			continue;
		}
		const extNum = Number.parseInt(p.externalId, 10);
		planMap.set(extNum, p.id);
		planNames.set(extNum, p.name);
	}

	const stationMap = new Map<number, string>();
	for (const s of stations) {
		if (!s.externalId) {
			continue;
		}
		stationMap.set(Number.parseInt(s.externalId, 10), s.id);
	}

	const apMap = new Map<number, string>();
	for (const a of aps) {
		if (!a.externalId) {
			continue;
		}
		apMap.set(Number.parseInt(a.externalId, 10), a.id);
	}

	const nasHostMap = new Map<string, string>();
	for (const n of nases) {
		if (n.host) {
			nasHostMap.set(n.host, n.id);
		}
	}

	const employeeMap = new Map<number, string>();
	for (const e of employees) {
		if (!e.externalId) {
			continue;
		}
		employeeMap.set(Number.parseInt(e.externalId, 10), e.id);
	}

	const dealerMap = new Map<number, string>();
	for (const d of dealers) {
		if (!d.externalId) {
			continue;
		}
		dealerMap.set(Number.parseInt(d.externalId, 10), d.id);
	}
	const activeDealerId = orgRecord?.activeDealerId ?? null;

	return {
		planMap,
		planNames,
		stationMap,
		apMap,
		nasHostMap,
		employeeMap,
		dealerMap,
		activeDealerId,
	};
}

/**
 * Shared scaffolding: resolve linked entities, build maps, fetch iRadius rows,
 * and call the provided callback with the resolved context.
 */
async function withEntitySyncContext<T>(
	input: {
		organizationId: string;
		entityType: "customer" | "employee";
		entityIds: string[];
	},
	callback: (ctx: {
		linked: Array<{ id: string; externalId: string }>;
		maps: SyncLookupMaps;
		rowByExtId: Map<string, Record<string, unknown>>;
	}) => Promise<T>,
): Promise<{ result: T; notLinked: string[] }> {
	const { entityType, entityIds, organizationId } = input;

	const entities =
		entityType === "customer"
			? await db.customer.findMany({
					where: { id: { in: entityIds }, organizationId },
					select: { id: true, externalId: true },
				})
			: await db.employee.findMany({
					where: { id: { in: entityIds }, organizationId },
					select: { id: true, externalId: true },
				});

	const linked = entities.filter(
		(e): e is typeof e & { externalId: string } => e.externalId != null,
	);
	const notLinked = entityIds.filter(
		(id) => !entities.some((e) => e.id === id && e.externalId),
	);

	if (linked.length === 0) {
		return {
			result: await callback({
				linked: [],
				maps: {} as SyncLookupMaps,
				rowByExtId: new Map(),
			}),
			notLinked,
		};
	}

	const maps = await buildLocalLookupMaps(organizationId);
	const extIds = linked.map((e) => e.externalId);

	const result = await withIRadiusConnection(async (conn) => {
		const ids = extIds.join(",");
		const rows =
			entityType === "customer"
				? await queryIRadius(
						conn,
						`SELECT ${CUSTOMER_SELECT_COLUMNS}
						${CUSTOMER_FROM_CLAUSE}
						WHERE u.ProfileId = 4 AND u.Id IN (${ids})
						ORDER BY u.Id`,
					)
				: await queryIRadius(
						conn,
						`SELECT ${EMPLOYEE_SELECT_COLUMNS}
						FROM User u
						WHERE u.ProfileId IN (1, 3, 6, 7, 8) AND u.Id IN (${ids})
						ORDER BY u.Id`,
					);

		const rowByExtId = new Map<string, Record<string, unknown>>();
		for (const row of rows) {
			rowByExtId.set(String(row["Id"] as number), row);
		}

		return callback({ linked, maps, rowByExtId });
	});

	return { result, notLinked };
}

const entitySyncInput = z.object({
	organizationId: z.string(),
	entityType: z.enum(["customer", "employee"]),
	entityIds: z.array(z.string()).min(1).max(50),
});

const entitySyncApplyInput = z.object({
	organizationId: z.string(),
	entityType: z.enum(["customer", "employee"]),
	/** Map of entity ID → list of field names to sync. If omitted, syncs all fields. */
	entities: z
		.array(
			z.object({
				id: z.string(),
				fields: z.array(z.string()).min(1),
			}),
		)
		.min(1)
		.max(50),
});

// ---------------------------------------------------------------------------
// Preview: read-only diff
// ---------------------------------------------------------------------------

export const previewIRadiusEntitySync = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/entity-sync/preview",
		tags: ["Customers"],
		summary:
			"Preview what would change if syncing specific entities from iRadius",
	})
	.input(entitySyncInput)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const { entityType, organizationId } = input;

		// Batch-fetch full local records for comparison (avoids N+1)
		const localRecords =
			entityType === "customer"
				? await db.customer.findMany({
						where: { id: { in: input.entityIds }, organizationId },
					})
				: await db.employee.findMany({
						where: { id: { in: input.entityIds }, organizationId },
					});

		const localById = new Map(
			localRecords.map((r) => [r.id, r as Record<string, unknown>]),
		);

		const { result: previews, notLinked } = await withEntitySyncContext(
			input,
			async ({ linked, maps, rowByExtId }) => {
				if (linked.length === 0) {
					return [];
				}

				const result: Array<{
					entityId: string;
					name: string;
					externalId: string;
					changes: Array<{
						field: string;
						local: string | null;
						remote: string | null;
					}>;
				}> = [];

				for (const entity of linked) {
					const row = rowByExtId.get(entity.externalId);
					if (!row) {
						continue;
					}

					const localRec = localById.get(entity.id);
					if (!localRec) {
						continue;
					}

					const remoteData =
						entityType === "customer"
							? buildCustomerDataFromRow(row, maps)
							: buildEmployeeDataFromRow(row, maps);

					const changes: Array<{
						field: string;
						local: string | null;
						remote: string | null;
					}> = [];

					for (const [key, remoteVal] of Object.entries(remoteData)) {
						if (key === "externalId") {
							continue;
						}
						const localVal = localRec[key];
						if (!valuesEqual(localVal, remoteVal)) {
							changes.push({
								field: key,
								local: serializeValue(localVal),
								remote: serializeValue(remoteVal),
							});
						}
					}

					const name =
						entityType === "customer"
							? (localRec["fullName"] as string) ||
								[localRec["firstName"], localRec["lastName"]]
									.filter(Boolean)
									.join(" ") ||
								"Unknown"
							: (localRec["name"] as string) || "Unknown";

					result.push({
						entityId: entity.id,
						name,
						externalId: entity.externalId,
						changes,
					});
				}

				return result;
			},
		);

		return { previews, notLinked };
	});

// ---------------------------------------------------------------------------
// Apply: write changes
// ---------------------------------------------------------------------------

export const applyIRadiusEntitySync = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/iradius/entity-sync/apply",
		tags: ["Customers"],
		summary: "Apply iRadius sync for specific entities and fields",
	})
	.input(entitySyncApplyInput)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"connections",
			"sync",
		);

		const { entityType, entities: entitySelections } = input;
		const entityIds = entitySelections.map((e) => e.id);
		const fieldsByEntityId = new Map(
			entitySelections.map((e) => [e.id, new Set(e.fields)]),
		);

		const { result } = await withEntitySyncContext(
			{ ...input, entityIds },
			async ({ linked, maps, rowByExtId }) => {
				if (linked.length === 0) {
					return { synced: 0, errors: [] as string[] };
				}

				let synced = 0;
				const errors: string[] = [];

				for (const entity of linked) {
					const row = rowByExtId.get(entity.externalId);
					if (!row) {
						continue;
					}

					const selectedFields = fieldsByEntityId.get(entity.id);
					if (!selectedFields || selectedFields.size === 0) {
						continue;
					}

					try {
						const fullData =
							entityType === "customer"
								? buildCustomerDataFromRow(row, maps)
								: buildEmployeeDataFromRow(row, maps);

						const data: Record<string, unknown> = {
							lastSyncedAt: new Date(),
						};
						for (const field of selectedFields) {
							if (field in fullData) {
								data[field] = (
									fullData as Record<string, unknown>
								)[field];
							}
						}

						if (entityType === "customer") {
							await db.customer.update({
								where: { id: entity.id },
								data,
							});
						} else {
							await db.employee.update({
								where: { id: entity.id },
								data,
							});
						}
						synced++;
					} catch (error) {
						errors.push(
							`${entity.externalId}: ${error instanceof Error ? error.message : "Unknown error"}`,
						);
					}
				}

				return { synced, errors };
			},
		);

		return result;
	});
