import {
	buildPhonesFromSync,
	db,
	extractPhoneNumbers,
	type Prisma,
} from "@repo/database";
import { queryIRadius, withIRadiusConnection } from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { IRADIUS_SYNC_QUEUE_NAME } from "../queues/iradius-sync.queue";
import type { IRadiusSyncJobData, IRadiusSyncJobResult } from "../types";
import { syncDealerCharges } from "./dealer-charges";
import {
	type ConflictField,
	IRADIUS_DELETED_FIELD,
	isAutoUpdateField,
	isConflictTrackedField,
	LOCAL_AUTHORITATIVE_FIELDS,
	ORPHAN_STUB_NOTES,
	serializeValue,
	valuesEqual,
} from "./iradius-sync-fields";

import {
	deriveStatus,
	inferConnectionType,
	kbpsToMbps,
	PROFILE_DEPARTMENT_MAP,
	PROFILE_POSITION_MAP,
	safeDate,
	toBigInt,
	toBooleanFromBit,
} from "./iradius-sync-helpers";

/**
 * Pre-fetch the current max sequential number for the org, then return
 * a synchronous function that increments a counter in memory.
 * Avoids N+1 queries (one per record).
 *
 * Uses numeric extraction instead of string sorting to avoid
 * lexicographic issues (e.g. "EMP-1" sorting after "EMP-00050").
 */
async function createNumberGenerator(config: {
	organizationId: string;
	prefix: string;
	findAll: (orgId: string) => Promise<string[]>;
}): Promise<() => string> {
	const allValues = await config.findAll(config.organizationId);
	const pattern = new RegExp(`${config.prefix}-(\\d+)`);
	let maxNumber = 0;
	for (const value of allValues) {
		const match = value.match(pattern);
		if (match?.[1]) {
			const num = Number.parseInt(match[1], 10);
			if (num > maxNumber) {
				maxNumber = num;
			}
		}
	}
	let nextNumber = maxNumber + 1;
	return () => {
		const num = nextNumber;
		nextNumber++;
		return `${config.prefix}-${String(num).padStart(5, "0")}`;
	};
}

export async function createAccountNumberGenerator(
	organizationId: string,
): Promise<() => string> {
	return createNumberGenerator({
		organizationId,
		prefix: "ACC",
		findAll: async (orgId) => {
			const rows = await db.customer.findMany({
				where: { organizationId: orgId },
				select: { accountNumber: true },
			});
			return rows.map((r) => r.accountNumber);
		},
	});
}

async function createEmployeeNumberGenerator(
	organizationId: string,
): Promise<() => string> {
	return createNumberGenerator({
		organizationId,
		prefix: "EMP",
		findAll: async (orgId) => {
			const rows = await db.employee.findMany({
				where: { organizationId: orgId },
				select: { employeeNumber: true },
			});
			return rows.map((r) => r.employeeNumber);
		},
	});
}

/** Map iRadius ProfileId to ISP role for auto-membership */
const PROFILE_ROLE_MAP: Record<number, string> = {
	1: "manager", // Administrator
	3: "manager", // Viewer
	6: "collector", // Collector
	7: "worker", // Help Desk
	8: "manager", // Read Only
};

/**
 * ISP role permissions used to seed OrganizationRole rows on first sync.
 *
 * This MUST stay in sync with `ISP_ROLE_TEMPLATES` in
 * `packages/auth/permissions/roles.ts`. It is duplicated (not imported) because
 * `@repo/auth` depends on `@repo/jobs`, so importing `@repo/auth` here would
 * create a circular workspace dependency. Keep the two in lockstep — drift here
 * is what silently strips worker permissions (e.g. customers:create,
 * servicePlans:read, groups:read) from synced orgs.
 */
const ISP_ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
	collector: {
		customers: ["read:own"],
		billing: ["view", "collect:own"],
		tasks: ["read:own"],
		followups: ["read", "update"],
		groups: ["read"],
	},
	worker: {
		customers: ["read", "create"],
		servicePlans: ["read"],
		tasks: ["create", "read:own", "update:own"],
		inventory: ["read", "update"],
		installations: ["create", "read:own", "update"],
		expenses: ["create", "read:own"],
		stations: ["read"],
		bases: ["read"],
		groups: ["read"],
	},
	dealer: {
		customers: ["read:own"],
		servicePlans: ["read"],
		billing: ["view"],
		bases: ["read"],
		groups: ["read"],
	},
	manager: {
		customers: ["create", "read", "update", "delete", "import", "export"],
		employees: ["read", "update"],
		servicePlans: ["read", "update"],
		stations: ["read", "update"],
		bases: ["create", "read", "update", "delete"],
		groups: ["read"],
		accessPoints: ["read", "update"],
		tasks: ["create", "read", "update", "delete", "assign", "approve"],
		billing: ["view", "manage", "collect"],
		inventory: ["create", "read", "update", "delete"],
		installations: ["create", "read", "update", "approve"],
		expenses: ["create", "read", "approve"],
		followups: ["create", "read", "update", "delete"],
		audit: ["view"],
	},
};

/**
 * Ensure a User + Member + OrganizationRole exists for an Employee.
 * Skips if employee has no email or already has a userId.
 */
async function ensureEmployeeMembership(
	employeeId: string,
	email: string | null,
	name: string,
	organizationId: string,
	profileId: number,
): Promise<void> {
	if (!email) {
		return;
	}

	// Check if employee already linked
	const emp = await db.employee.findUnique({
		where: { id: employeeId },
		select: { userId: true },
	});
	if (emp?.userId) {
		return;
	}

	// Find or create User
	let targetUser = await db.user.findFirst({ where: { email } });
	if (!targetUser) {
		targetUser = await db.user.create({
			data: {
				name,
				email,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
	}

	// Determine role
	const roleKey = PROFILE_ROLE_MAP[profileId] ?? "member";

	// Ensure OrganizationRole exists for this role (skip for system roles)
	if (roleKey !== "member") {
		const permissions = ISP_ROLE_PERMISSIONS[roleKey] ?? {};

		await db.organizationRole.upsert({
			where: {
				organizationId_role: { organizationId, role: roleKey },
			},
			create: {
				organizationId,
				role: roleKey,
				permission: JSON.stringify(permissions),
			},
			update: {},
		});
	}

	// Ensure membership
	const existingMember = await db.member.findFirst({
		where: { organizationId, userId: targetUser.id },
	});
	if (!existingMember) {
		await db.member.create({
			data: {
				organizationId,
				userId: targetUser.id,
				role: roleKey,
				createdAt: new Date(),
			},
		});
	}

	// Link employee to user
	await db.employee.update({
		where: { id: employeeId },
		data: { userId: targetUser.id },
	});
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Reusable cleanup for iRadius-managed entities. After a phase has finished
 * processing rows from iRadius, this finds local records that have an
 * `externalId` but were not present in the current iRadius set and marks them
 * with `deletedAt = syncTimestamp`. Records already soft-deleted are left
 * alone (no double-write).
 *
 * The caller passes:
 *   - the Prisma delegate (typed loosely because each model has a different
 *     `updateMany` shape and we don't need the strict types here),
 *   - the pre-fetched local snapshot (taken before the loop so we never
 *     delete rows we created in this same run),
 *   - the set of external IDs we actually accepted for this phase.
 *
 * Cross-dealer-skipped customers are intentionally absent from the seen-set
 * (the caller doesn't add them), so they get soft-deleted from this org's
 * scope. That's the dotnet2 → eliedebel case: their iRadius `User` row still
 * exists, but it belongs to another dealer's subtree, so it should no longer
 * appear in this org.
 */
async function softDeleteStaleRecords(opts: {
	// We accept any delegate that exposes the precise `updateMany` shape we
	// need. This avoids `any` while letting all sync-managed Prisma models
	// satisfy the type — each generated delegate's `updateMany` accepts a
	// `where` and `data` field that fit this signature.
	delegate: {
		updateMany: (args: {
			where: { id: { in: string[] }; deletedAt: null };
			data: { deletedAt: Date };
		}) => Promise<{ count: number }>;
	};
	existing: Array<{
		id: string;
		externalId: string | null;
		deletedAt: Date | null;
	}>;
	seenExtIds: Set<string>;
	timestamp: Date;
}): Promise<number> {
	const staleIds: string[] = [];
	for (const row of opts.existing) {
		if (!row.externalId) {
			continue;
		}
		if (row.deletedAt !== null) {
			continue;
		}
		if (opts.seenExtIds.has(row.externalId)) {
			continue;
		}
		staleIds.push(row.id);
	}
	if (staleIds.length === 0) {
		return 0;
	}
	// Chunk to keep the SQL parameter list reasonable on very large orgs.
	let removed = 0;
	const chunkSize = 500;
	for (let i = 0; i < staleIds.length; i += chunkSize) {
		const chunk = staleIds.slice(i, i + chunkSize);
		const res = await opts.delegate.updateMany({
			where: { id: { in: chunk }, deletedAt: null },
			data: { deletedAt: opts.timestamp },
		});
		removed += res.count;
	}
	return removed;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

async function updateProgress(
	operationId: string,
	data: Record<string, unknown>,
) {
	await db.iRadiusSyncOperation.update({
		where: { id: operationId },
		data,
	});
}

// ---------------------------------------------------------------------------
// Main sync processor
// ---------------------------------------------------------------------------

async function processIRadiusSync(
	job: Job<IRadiusSyncJobData>,
): Promise<IRadiusSyncJobResult> {
	const { operationId, mode } = job.data;

	// For full sync mode, organizationId is required
	// For dealers-only mode, it's not needed (global sync)
	if (mode !== "dealers-only" && !job.data.organizationId) {
		throw new Error("organizationId is required for full sync mode");
	}
	const organizationId = job.data.organizationId as string;

	// Belt-and-suspenders: refuse to run for orgs with iRadius disabled.
	// Anything queued before the API gate was added (or queued through a
	// different path) bails here instead of creating duplicate rows.
	if (mode !== "dealers-only" && organizationId) {
		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { iradiusDisabled: true },
		});
		if (org?.iradiusDisabled) {
			await updateProgress(operationId, {
				status: "failed",
				completedAt: new Date(),
				result: {
					errors: [
						{
							phase: "guard",
							detail: "iRadius is disabled for this organization",
						},
					],
				},
			});
			return { success: false, operationId };
		}
	}

	logger.info(`[iRadius Sync] Starting operation ${operationId}`, {
		operationId,
		organizationId: organizationId || "(global)",
	});

	await updateProgress(operationId, {
		status: "in_progress",
		startedAt: new Date(),
	});

	try {
		const finalResult = await withIRadiusConnection(async (conn) => {
			// `removed` is the count soft-deleted in this run (DB record had an
			// externalId but did not appear in the iRadius source set, or — for
			// customers — was filtered out by the cross-dealer guard).
			// `restored` counts previously soft-deleted records that reappeared
			// in iRadius and had their `deletedAt` cleared.
			const result = {
				plans: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				stations: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				accessPoints: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				nas: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				routers: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				dealers: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				dealerAccounts: { created: 0, skipped: 0, errors: 0 },
				dealerCharges: { created: 0, skipped: 0, errors: 0 },
				employees: {
					created: 0,
					updated: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				customers: {
					created: 0,
					updated: 0,
					conflicted: 0,
					removed: 0,
					restored: 0,
					errors: 0,
				},
				errors: [] as Array<{ phase: string; detail: string }>,
			};

			// Maps populated by Phases 1-5, referenced by later phases
			const planMap = new Map<number, string>();
			const planNames = new Map<number, string>();
			const stationMap = new Map<number, string>();
			const apMap = new Map<number, string>();
			const nasHostMap = new Map<string, string>();

			// Phases 1-5 only run in full sync mode (need organizationId)
			if (mode !== "dealers-only") {
				// ================================================================
				// Phase 1: Service Plans
				// ================================================================
				await updateProgress(operationId, { phase: "plans" });

				const accountTypes = await queryIRadius(
					conn,
					`SELECT Id, AccountTypeName, Rate, Commision, ParentCommision, DealerId,
					IpPoolName, BasicSpeedUp, BasicSpeedDown, ValidityPeriod,
					CombinedMaxMonthlyUpAndDown, SeperateMaxDailyUp, SeperateMaxDailyDown,
					SellingPrice, MaxUsers, CanShowOnUserInterface,
					AutoBindAccToMac, Refundable, RefundableByGB, CanChangeMac, CanChangeUserName,
					ImmediateRecharge, PreventBeforeRecharge, TotalSession, TotalSessionPeriodTypeId,
					ValidityPeriodTypeId, SeperateMaxMonthlyUp, SeperateMaxMonthlyDown,
					MonthlyPoolAfterMax, UlDlForAutoFallBack, UnlimtedTimeTo, UmlimitedTimeFrom,
					NewIpPoolAfterMax, CombinedMaxUpAndDown, ResetCounterTime, ExpiryAccountPool,
					UlDlMonthlyForAutoFallBack, DisablePoolName, ProceraId, ExpiryProceraId,
					AccountTypeCategory, AdminId, CanExcludeQuotaByIpAddress, FupResetPrice,
					AddressListId, DefaultAddressListIds, QueueTreeMode, NasId
				FROM AccountType ORDER BY Id`,
				);

				await updateProgress(operationId, {
					totalPlans: accountTypes.length,
				});

				// "UP TO X" plans don't set AccountType quota columns — their cap
				// is encoded as an auto-fallback step (AboveMB = MB consumed before
				// throttling). Pull the lowest step per plan so the usage cell can
				// show the real cap instead of the default daily allocation.
				const buildFallbackMap = (
					rows: Record<string, unknown>[],
				): Map<number, number> => {
					const map = new Map<number, number>();
					for (const row of rows) {
						const id = row["AccountTypeId"];
						const mb = row["AboveMB"];
						if (id != null && mb != null) {
							map.set(Number(id), Number(mb));
						}
					}
					return map;
				};
				const dailyFallbackByAcct = buildFallbackMap(
					await queryIRadius(
						conn,
						`SELECT AccountTypeId, MIN(AboveMB) AS AboveMB
						FROM AccountTypeDailyAutoFallBack
						WHERE AboveMB IS NOT NULL
						GROUP BY AccountTypeId`,
					),
				);
				const monthlyFallbackByAcct = buildFallbackMap(
					await queryIRadius(
						conn,
						`SELECT AccountTypeId, MIN(AboveMB) AS AboveMB
						FROM AccountTypeMonthlyAutoFallBack
						WHERE AboveMB IS NOT NULL
						GROUP BY AccountTypeId`,
					),
				);

				const existingPlans = await db.servicePlan.findMany({
					where: { organizationId },
					select: {
						id: true,
						name: true,
						externalId: true,
						deletedAt: true,
					},
				});
				const planByExtId = new Map(
					existingPlans
						.filter((p) => p.externalId)
						.map((p) => [p.externalId, p.id]),
				);
				const planDeletedAtByExtId = new Map(
					existingPlans
						.filter((p) => p.externalId)
						.map((p) => [p.externalId, p.deletedAt]),
				);
				const planByName = new Map(
					existingPlans.map((p) => [p.name.toLowerCase(), p.id]),
				);
				// Track every iRadius `AccountType` row we accepted this run.
				// Used at end-of-phase to soft-delete plans whose externalId is
				// absent from this set, and to count restores (rows whose
				// `deletedAt` we cleared because they reappeared).
				const seenPlanExtIds = new Set<string>();

				for (let i = 0; i < accountTypes.length; i++) {
					const at = accountTypes[i];
					if (!at) {
						continue;
					}
					const name = at["AccountTypeName"] as string;
					if (!name) {
						continue;
					}
					const extId = String(at["Id"]);
					seenPlanExtIds.add(extId);
					const existing =
						planByExtId.get(extId) ??
						planByName.get(name.toLowerCase());

					const planData = {
						name,
						externalId: extId,
						downloadSpeed: kbpsToMbps(at["BasicSpeedDown"]),
						uploadSpeed: kbpsToMbps(at["BasicSpeedUp"]),
						monthlyPrice:
							(at["SellingPrice"] as number) ??
							(at["Rate"] as number) ??
							0,
						rate: (at["Rate"] as number) ?? null,
						sellingPrice: (at["SellingPrice"] as number) ?? null,
						validityPeriod:
							(at["ValidityPeriod"] as number | null) ?? null,
						monthlyQuota:
							(at["CombinedMaxMonthlyUpAndDown"] as
								| number
								| null) ?? null,
						dailyQuotaUp:
							(at["SeperateMaxDailyUp"] as number | null) ?? null,
						dailyQuotaDown:
							(at["SeperateMaxDailyDown"] as number | null) ??
							null,
						ipPoolName: (at["IpPoolName"] as string | null) ?? null,
						maxUsers: (at["MaxUsers"] as number | null) ?? null,
						visible: toBooleanFromBit(at["CanShowOnUserInterface"]),
						commission: (at["Commision"] as number) ?? 0,
						parentCommission:
							(at["ParentCommision"] as number) ?? 0,
						dealerExternalId: at["DealerId"]
							? String(at["DealerId"])
							: null,
						// iRadius AccountType fields
						autoBindAccToMac: toBooleanFromBit(
							at["AutoBindAccToMac"],
						),
						refundable: toBooleanFromBit(at["Refundable"]),
						refundableByGb: toBooleanFromBit(at["RefundableByGB"]),
						canChangeMac: toBooleanFromBit(at["CanChangeMac"]),
						canChangeUserName: toBooleanFromBit(
							at["CanChangeUserName"],
						),
						immediateRecharge: toBooleanFromBit(
							at["ImmediateRecharge"],
						),
						preventBeforeRecharge: toBooleanFromBit(
							at["PreventBeforeRecharge"],
						),
						totalSession:
							(at["TotalSession"] as number | null) ?? null,
						totalSessionPeriodTypeId:
							(at["TotalSessionPeriodTypeId"] as number | null) ??
							null,
						validityPeriodTypeId:
							(at["ValidityPeriodTypeId"] as number | null) ??
							null,
						separateMaxMonthlyUp:
							(at["SeperateMaxMonthlyUp"] as number | null) ??
							null,
						separateMaxMonthlyDown:
							(at["SeperateMaxMonthlyDown"] as number | null) ??
							null,
						monthlyPoolAfterMax:
							(at["MonthlyPoolAfterMax"] as string | null) ??
							null,
						ulDlForAutoFallBack: toBooleanFromBit(
							at["UlDlForAutoFallBack"],
						),
						unlimitedTimeTo:
							(at["UnlimtedTimeTo"] as string | null) ?? null,
						unlimitedTimeFrom:
							(at["UmlimitedTimeFrom"] as string | null) ?? null,
						newIpPoolAfterMax:
							(at["NewIpPoolAfterMax"] as string | null) ?? null,
						combinedMaxUpAndDown:
							(at["CombinedMaxUpAndDown"] as number | null) ??
							null,
						dailyFallbackMb:
							dailyFallbackByAcct.get(at["Id"] as number) ?? null,
						monthlyFallbackMb:
							monthlyFallbackByAcct.get(at["Id"] as number) ??
							null,
						resetCounterTime:
							(at["ResetCounterTime"] as string | null) ?? null,
						expiryAccountPool:
							(at["ExpiryAccountPool"] as string | null) ?? null,
						ulDlMonthlyForAutoFallBack: toBooleanFromBit(
							at["UlDlMonthlyForAutoFallBack"],
						),
						disablePoolName:
							(at["DisablePoolName"] as string | null) ?? null,
						proceraId: (at["ProceraId"] as number | null) ?? null,
						expiryProceraId:
							(at["ExpiryProceraId"] as number | null) ?? null,
						accountTypeCategory:
							(at["AccountTypeCategory"] as number | null) ??
							null,
						adminId: (at["AdminId"] as number | null) ?? null,
						canExcludeQuotaByIpAddress: toBooleanFromBit(
							at["CanExcludeQuotaByIpAddress"],
						),
						fupResetPrice:
							(at["FupResetPrice"] as number | null) ?? null,
						addressListId:
							(at["AddressListId"] as number | null) ?? null,
						defaultAddressListIds:
							(at["DefaultAddressListIds"] as number | null) ??
							null,
						queueTreeMode: toBooleanFromBit(at["QueueTreeMode"]),
						iRadiusNasId: (at["NasId"] as number | null) ?? null,
					};

					if (existing) {
						planMap.set(at["Id"] as number, existing);
						const wasDeleted =
							planDeletedAtByExtId.get(extId) !== null &&
							planDeletedAtByExtId.get(extId) !== undefined;
						await db.servicePlan
							.update({
								where: { id: existing },
								data: {
									...planData,
									lastSyncedAt: new Date(),
									// Clearing `deletedAt` on every update is
									// idempotent (no-op when already null) and
									// keeps the restore logic in one place.
									deletedAt: null,
								},
							})
							.catch(() => {});
						if (wasDeleted) {
							result.plans.restored++;
						}
						result.plans.updated++;
					} else {
						try {
							const plan = await db.servicePlan.create({
								data: {
									organizationId,
									lastSyncedAt: new Date(),
									...planData,
								},
							});
							planMap.set(at["Id"] as number, plan.id);
							result.plans.created++;
						} catch (error) {
							result.plans.errors++;
							if (result.errors.length < 50) {
								result.errors.push({
									phase: "plans",
									detail: `"${name}": ${error instanceof Error ? error.message : "Unknown"}`,
								});
							}
						}
					}

					if (i > 0 && i % 100 === 0) {
						await updateProgress(operationId, {
							processedPlans: i,
						});
					}
				}

				await updateProgress(operationId, {
					processedPlans: accountTypes.length,
				});

				// Cleanup: soft-delete plans whose iRadius AccountType row is gone.
				result.plans.removed = await softDeleteStaleRecords({
					delegate: db.servicePlan,
					existing: existingPlans,
					seenExtIds: seenPlanExtIds,
					timestamp: new Date(),
				});

				// Build plan name lookup for connection type inference
				for (const at of accountTypes) {
					if (at["AccountTypeName"]) {
						planNames.set(
							at["Id"] as number,
							at["AccountTypeName"] as string,
						);
					}
				}

				// ================================================================
				// Phase 2: Stations
				// ================================================================
				await updateProgress(operationId, { phase: "stations" });

				const stations = await queryIRadius(
					conn,
					`SELECT Id, Name, Host, Port, SSHPort, Ip, Online, VlanId, Version, UpTime,
					UserName, Password, APUserName, APPassword, APAPIPort, APSSHPort,
					BoardName, CpuLoad, Voltage, ScanStatus
				FROM Station ORDER BY Id`,
				);

				await updateProgress(operationId, {
					totalStations: stations.length,
				});

				const existingStations = await db.station.findMany({
					where: { organizationId },
					select: {
						id: true,
						name: true,
						externalId: true,
						deletedAt: true,
					},
				});
				const stationByExtId = new Map(
					existingStations
						.filter((s) => s.externalId)
						.map((s) => [s.externalId, s.id]),
				);
				const stationDeletedAtByExtId = new Map(
					existingStations
						.filter((s) => s.externalId)
						.map((s) => [s.externalId, s.deletedAt]),
				);
				const stationByName = new Map(
					existingStations.map((s) => [s.name.toLowerCase(), s.id]),
				);
				const seenStationExtIds = new Set<string>();

				for (let i = 0; i < stations.length; i++) {
					const st = stations[i];
					if (!st) {
						continue;
					}
					const name = st["Name"] as string;
					if (!name) {
						continue;
					}
					const extId = String(st["Id"]);
					seenStationExtIds.add(extId);
					const existing =
						stationByExtId.get(extId) ??
						stationByName.get(name.toLowerCase());

					const stationData = {
						name,
						externalId: extId,
						address:
							(st["Ip"] as string) ??
							(st["Host"] as string) ??
							null,
						host: (st["Host"] as string) ?? null,
						apiPort: (st["Port"] as number) ?? null,
						sshPort: (st["SSHPort"] as number) ?? null,
						vlanId: (st["VlanId"] as number) ?? null,
						version: (st["Version"] as string) ?? null,
						uptime: (st["UpTime"] as string) ?? null,
						sshUsername: (st["UserName"] as string) ?? null,
						sshPassword: (st["Password"] as string) ?? null,
						apUsername: (st["APUserName"] as string) ?? null,
						apPassword: (st["APPassword"] as string) ?? null,
						apApiPort: (st["APAPIPort"] as number) ?? null,
						apSshPort: (st["APSSHPort"] as number) ?? null,
						boardName: (st["BoardName"] as string) ?? null,
						cpuLoad: (st["CpuLoad"] as string) ?? null,
						voltage: (st["Voltage"] as string) ?? null,
						online: toBooleanFromBit(st["Online"]),
						scanStatus: toBooleanFromBit(st["ScanStatus"]),
					};

					if (existing) {
						stationMap.set(st["Id"] as number, existing);
						const wasDeleted =
							stationDeletedAtByExtId.get(extId) !== null &&
							stationDeletedAtByExtId.get(extId) !== undefined;
						await db.station
							.update({
								where: { id: existing },
								data: {
									...stationData,
									lastSyncedAt: new Date(),
									deletedAt: null,
								},
							})
							.catch(() => {});
						if (wasDeleted) {
							result.stations.restored++;
						}
						result.stations.updated++;
					} else {
						try {
							const station = await db.station.create({
								data: {
									organizationId,
									lastSyncedAt: new Date(),
									...stationData,
								},
							});
							stationMap.set(st["Id"] as number, station.id);
							result.stations.created++;
						} catch (error) {
							result.stations.errors++;
							if (result.errors.length < 50) {
								result.errors.push({
									phase: "stations",
									detail: `"${name}": ${error instanceof Error ? error.message : "Unknown"}`,
								});
							}
						}
					}

					if (i > 0 && i % 100 === 0) {
						await updateProgress(operationId, {
							processedStations: i,
						});
					}
				}

				await updateProgress(operationId, {
					processedStations: stations.length,
				});

				// Cleanup: soft-delete stations no longer in iRadius.
				result.stations.removed = await softDeleteStaleRecords({
					delegate: db.station,
					existing: existingStations,
					seenExtIds: seenStationExtIds,
					timestamp: new Date(),
				});

				// ================================================================
				// Phase 3: Access Points
				// ================================================================
				await updateProgress(operationId, { phase: "accessPoints" });

				const accessPoints = await queryIRadius(
					conn,
					"SELECT Id, StationId, Name, MacAddress, `Interface`, IP, Online, `Signal`, UpTime, BoardName, Version, IsUbnt, AutoNegotioation, FullDuplex, ScanStatus FROM AccessPoint ORDER BY Id",
				);

				await updateProgress(operationId, {
					totalAccessPoints: accessPoints.length,
				});

				const existingAPs = await db.accessPoint.findMany({
					where: { organizationId },
					select: { id: true, externalId: true, deletedAt: true },
				});
				const apByExtId = new Map(
					existingAPs
						.filter((a) => a.externalId)
						.map((a) => [a.externalId, a.id]),
				);
				const apDeletedAtByExtId = new Map(
					existingAPs
						.filter((a) => a.externalId)
						.map((a) => [a.externalId, a.deletedAt]),
				);
				const seenApExtIds = new Set<string>();

				for (let i = 0; i < accessPoints.length; i++) {
					const ap = accessPoints[i];
					if (!ap) {
						continue;
					}
					const name = ap["Name"] as string;
					if (!name) {
						continue;
					}
					const extId = String(ap["Id"]);
					seenApExtIds.add(extId);
					const existing = apByExtId.get(extId);

					const stationId = ap["StationId"]
						? (stationMap.get(ap["StationId"] as number) ?? null)
						: null;

					const apData = {
						name,
						externalId: extId,
						stationId,
						macAddress: (ap["MacAddress"] as string) ?? null,
						ipAddress: (ap["IP"] as string) ?? null,
						signal: (ap["Signal"] as string) ?? null,
						boardName: (ap["BoardName"] as string) ?? null,
						version: (ap["Version"] as string) ?? null,
						interface: (ap["Interface"] as string) ?? null,
						uptime: (ap["UpTime"] as string) ?? null,
						isUbiquiti: toBooleanFromBit(ap["IsUbnt"]),
						online: toBooleanFromBit(ap["Online"]),
						autoNegotiation: toBooleanFromBit(
							ap["AutoNegotioation"],
						),
						fullDuplex: toBooleanFromBit(ap["FullDuplex"]),
						scanStatus: toBooleanFromBit(ap["ScanStatus"]),
					};

					if (existing) {
						apMap.set(ap["Id"] as number, existing);
						const wasDeleted =
							apDeletedAtByExtId.get(extId) !== null &&
							apDeletedAtByExtId.get(extId) !== undefined;
						await db.accessPoint
							.update({
								where: { id: existing },
								data: {
									...apData,
									lastSyncedAt: new Date(),
									deletedAt: null,
								},
							})
							.catch(() => {});
						if (wasDeleted) {
							result.accessPoints.restored++;
						}
						result.accessPoints.updated++;
					} else {
						try {
							const created = await db.accessPoint.create({
								data: {
									organizationId,
									lastSyncedAt: new Date(),
									...apData,
								},
							});
							apMap.set(ap["Id"] as number, created.id);
							result.accessPoints.created++;
						} catch (error) {
							result.accessPoints.errors++;
							if (result.errors.length < 50) {
								result.errors.push({
									phase: "accessPoints",
									detail: `"${name}": ${error instanceof Error ? error.message : "Unknown"}`,
								});
							}
						}
					}

					if (i > 0 && i % 100 === 0) {
						await updateProgress(operationId, {
							processedAccessPoints: i,
						});
					}
				}

				await updateProgress(operationId, {
					processedAccessPoints: accessPoints.length,
				});

				// Cleanup: soft-delete access points no longer in iRadius.
				result.accessPoints.removed = await softDeleteStaleRecords({
					delegate: db.accessPoint,
					existing: existingAPs,
					seenExtIds: seenApExtIds,
					timestamp: new Date(),
				});

				// ================================================================
				// Phase 4: NAS Servers
				// ================================================================
				await updateProgress(operationId, { phase: "nas" });

				const nasServers = await queryIRadius(
					conn,
					`SELECT Id, ShortName, Host, SharedSecret, ApiPort, Active,
					Description, ApiUserName, ApiPassword, OnlineUsers, FaultSession,
					CountFaultSession, MinutesToRemoveNasFilter, NasTypeId, AdminId,
					MikrotikNewVersion, SSHPort, SSHUserName, SSHPassword
				FROM Nas ORDER BY Id`,
				);

				await updateProgress(operationId, {
					totalNas: nasServers.length,
				});

				const existingNas = await db.ispNas.findMany({
					where: { organizationId },
					select: {
						id: true,
						externalId: true,
						host: true,
						deletedAt: true,
					},
				});
				const nasByExtId = new Map(
					existingNas
						.filter((n) => n.externalId)
						.map((n) => [n.externalId, n.id]),
				);
				const nasDeletedAtByExtId = new Map(
					existingNas
						.filter((n) => n.externalId)
						.map((n) => [n.externalId, n.deletedAt]),
				);
				const seenNasExtIds = new Set<string>();
				// Pre-populate nasHostMap with existing NAS records
				for (const n of existingNas) {
					if (n.host) {
						nasHostMap.set(n.host, n.id);
					}
				}

				for (let i = 0; i < nasServers.length; i++) {
					const nas = nasServers[i];
					if (!nas) {
						continue;
					}
					const name =
						(nas["ShortName"] as string) || `NAS-${nas["Id"]}`;
					const extId = String(nas["Id"]);
					seenNasExtIds.add(extId);
					const existing = nasByExtId.get(extId);

					const nasData = {
						name,
						externalId: extId,
						host: (nas["Host"] as string) ?? null,
						sharedSecret: (nas["SharedSecret"] as string) ?? null,
						apiPort: (nas["ApiPort"] as number) ?? null,
						active: toBooleanFromBit(nas["Active"]),
						description: (nas["Description"] as string) ?? null,
						apiUserName: (nas["ApiUserName"] as string) ?? null,
						apiPassword: (nas["ApiPassword"] as string) ?? null,
						onlineUsers: (nas["OnlineUsers"] as number) ?? null,
						faultSession: toBooleanFromBit(nas["FaultSession"]),
						countFaultSession:
							(nas["CountFaultSession"] as number) ?? null,
						minutesToRemoveNasFilter:
							(nas["MinutesToRemoveNasFilter"] as number) ?? null,
						nasTypeId: (nas["NasTypeId"] as number) ?? null,
						adminId: (nas["AdminId"] as number) ?? null,
						mikrotikNewVersion: toBooleanFromBit(
							nas["MikrotikNewVersion"],
						),
						sshPort: (nas["SSHPort"] as number) ?? null,
						sshUserName: (nas["SSHUserName"] as string) ?? null,
						sshPassword: (nas["SSHPassword"] as string) ?? null,
					};

					if (existing) {
						const wasDeleted =
							nasDeletedAtByExtId.get(extId) !== null &&
							nasDeletedAtByExtId.get(extId) !== undefined;
						await db.ispNas
							.update({
								where: { id: existing },
								data: {
									...nasData,
									lastSyncedAt: new Date(),
									deletedAt: null,
								},
							})
							.catch(() => {});
						if (nasData.host) {
							nasHostMap.set(nasData.host, existing);
						}
						if (wasDeleted) {
							result.nas.restored++;
						}
						result.nas.updated++;
					} else {
						try {
							const created = await db.ispNas.create({
								data: {
									organizationId,
									lastSyncedAt: new Date(),
									...nasData,
								},
							});
							if (nasData.host) {
								nasHostMap.set(nasData.host, created.id);
							}
							result.nas.created++;
						} catch (error) {
							result.nas.errors++;
							if (result.errors.length < 50) {
								result.errors.push({
									phase: "nas",
									detail: `"${name}": ${error instanceof Error ? error.message : "Unknown"}`,
								});
							}
						}
					}

					if (i > 0 && i % 100 === 0) {
						await updateProgress(operationId, {
							processedNas: i,
						});
					}
				}

				await updateProgress(operationId, {
					processedNas: nasServers.length,
				});

				// Cleanup: soft-delete NAS records no longer in iRadius.
				result.nas.removed = await softDeleteStaleRecords({
					delegate: db.ispNas,
					existing: existingNas,
					seenExtIds: seenNasExtIds,
					timestamp: new Date(),
				});

				// ================================================================
				// Phase 5: Routers
				// ================================================================
				await updateProgress(operationId, { phase: "routers" });

				const routers = await queryIRadius(
					conn,
					"SELECT Id, StationId, AccessPointId, Name, Ip, MacAddress FROM Router ORDER BY Id",
				);

				await updateProgress(operationId, {
					totalRouters: routers.length,
				});

				const existingRouters = await db.ispRouter.findMany({
					where: { organizationId },
					select: { id: true, externalId: true, deletedAt: true },
				});
				const routerByExtId = new Map(
					existingRouters
						.filter((r) => r.externalId)
						.map((r) => [r.externalId, r.id]),
				);
				const routerDeletedAtByExtId = new Map(
					existingRouters
						.filter((r) => r.externalId)
						.map((r) => [r.externalId, r.deletedAt]),
				);
				const seenRouterExtIds = new Set<string>();

				for (let i = 0; i < routers.length; i++) {
					const rt = routers[i];
					if (!rt) {
						continue;
					}
					const name = (rt["Name"] as string) || `Router-${rt["Id"]}`;
					const extId = String(rt["Id"]);
					seenRouterExtIds.add(extId);
					const existing = routerByExtId.get(extId);

					const stationId = rt["StationId"]
						? (stationMap.get(rt["StationId"] as number) ?? null)
						: null;
					const accessPointId = rt["AccessPointId"]
						? (apMap.get(rt["AccessPointId"] as number) ?? null)
						: null;

					const routerData = {
						name,
						externalId: extId,
						ipAddress: (rt["Ip"] as string) ?? null,
						macAddress: (rt["MacAddress"] as string) ?? null,
						stationId,
						accessPointId,
					};

					if (existing) {
						const wasDeleted =
							routerDeletedAtByExtId.get(extId) !== null &&
							routerDeletedAtByExtId.get(extId) !== undefined;
						await db.ispRouter
							.update({
								where: { id: existing },
								data: {
									...routerData,
									lastSyncedAt: new Date(),
									deletedAt: null,
								},
							})
							.catch(() => {});
						if (wasDeleted) {
							result.routers.restored++;
						}
						result.routers.updated++;
					} else {
						try {
							await db.ispRouter.create({
								data: {
									organizationId,
									lastSyncedAt: new Date(),
									...routerData,
								},
							});
							result.routers.created++;
						} catch (error) {
							result.routers.errors++;
							if (result.errors.length < 50) {
								result.errors.push({
									phase: "routers",
									detail: `"${name}": ${error instanceof Error ? error.message : "Unknown"}`,
								});
							}
						}
					}

					if (i > 0 && i % 100 === 0) {
						await updateProgress(operationId, {
							processedRouters: i,
						});
					}
				}

				await updateProgress(operationId, {
					processedRouters: routers.length,
				});

				// Cleanup: soft-delete routers no longer in iRadius.
				result.routers.removed = await softDeleteStaleRecords({
					delegate: db.ispRouter,
					existing: existingRouters,
					seenExtIds: seenRouterExtIds,
					timestamp: new Date(),
				});
			} // end of phases 1-5 (skipped in dealers-only mode)

			// ================================================================
			// Phase 6: Dealers
			// In "dealers-only" mode (admin sync) we fetch from iRadius and create/update.
			// In normal org sync this phase is skipped — the org's activeDealerId is
			// used directly for customer/employee dealer assignment.
			// ================================================================
			await updateProgress(operationId, { phase: "dealers" });

			const dealerMap = new Map<number, string>();

			if (mode === "dealers-only") {
				// Admin-triggered global dealer sync: fetch from iRadius and create/update
				// Dealers are stored without an organizationId — admins assign them later
				const dealerRows = await queryIRadius(
					conn,
					`SELECT u.Id, u.UserName, u.FirstName, u.LastName, u.Mobile, u.Phone,
						u.MailAddress, u.ParentId, u.Archived,
						d.Credit, d.Commision, d.CompanyName, d.CompanyAddress, d.CompanyPhone,
						d.CompanyMobile, d.CompanyVatNumber, d.SmsSenderId, d.NotificationAmount,
						d.FupResetPrice, d.ExtraOneGPPrice, d.ExtraOneGPCommision,
						d.CanShowRate, d.CanShowSpeed, d.NoCharge, d.CanSendMail, d.CanSendSMS,
						d.CanExportToExcel, d.CanAddDealer, d.CanDeleteUser, d.CanChangeAccountType,
						d.NotifyBefore3Days, d.NotifyBefore2Days, d.NotifyBefore1Day,
						d.ExtraGB, d.CanShowOnlineUsersSpeed, d.UserNotification,
						d.CanMonitorLog, d.ChargeIfNotExpiry
					FROM User u
					INNER JOIN Dealer d ON d.UserId = u.Id
					WHERE u.ProfileId = 2
					ORDER BY u.Id`,
				);

				await updateProgress(operationId, {
					totalDealers: dealerRows.length,
				});

				// Look up ALL existing dealers globally (not scoped to any org)
				const existingDealers = await db.ispDealer.findMany({
					where: { externalId: { not: null } },
					select: { id: true, externalId: true, deletedAt: true },
				});
				const dealerByExtId = new Map(
					existingDealers
						.filter((d) => d.externalId)
						.map((d) => [d.externalId, d.id]),
				);
				const dealerDeletedAtByExtId = new Map(
					existingDealers
						.filter((d) => d.externalId)
						.map((d) => [d.externalId, d.deletedAt]),
				);
				const seenDealerExtIds = new Set<string>();

				// Pass 1: Create/update all dealers without parent resolution
				for (let i = 0; i < dealerRows.length; i++) {
					const dr = dealerRows[i];
					if (!dr) {
						continue;
					}
					const dealerUserId = dr["Id"] as number;
					const extId = String(dealerUserId);
					seenDealerExtIds.add(extId);
					const existing = dealerByExtId.get(extId);

					const dealerData = {
						name:
							[dr["FirstName"], dr["LastName"]]
								.filter(Boolean)
								.join(" ")
								.trim() || "Unknown",
						externalId: extId,
						username: (dr["UserName"] as string) || null,
						email: (dr["MailAddress"] as string) || null,
						phone:
							(dr["Mobile"] as string) ||
							(dr["Phone"] as string) ||
							null,
						companyName: (dr["CompanyName"] as string) || null,
						companyAddress:
							(dr["CompanyAddress"] as string) || null,
						companyPhone: (dr["CompanyPhone"] as string) || null,
						companyMobile: (dr["CompanyMobile"] as string) || null,
						companyVatNumber:
							(dr["CompanyVatNumber"] as string) || null,
						credit: (dr["Credit"] as number) ?? 0,
						commission: (dr["Commision"] as number) ?? 0,
						smsSenderId: (dr["SmsSenderId"] as string) || null,
						notificationAmount:
							(dr["NotificationAmount"] as number) ?? null,
						fupResetPrice: (dr["FupResetPrice"] as number) ?? null,
						extraOneGbPrice:
							(dr["ExtraOneGPPrice"] as number) ?? null,
						extraOneGbCommission:
							(dr["ExtraOneGPCommision"] as number) ?? null,
						canShowRate: toBooleanFromBit(dr["CanShowRate"]),
						canShowSpeed: toBooleanFromBit(dr["CanShowSpeed"]),
						noCharge: toBooleanFromBit(dr["NoCharge"]),
						canSendMail: toBooleanFromBit(dr["CanSendMail"]),
						canSendSms: toBooleanFromBit(dr["CanSendSMS"]),
						canExportToExcel: toBooleanFromBit(
							dr["CanExportToExcel"],
						),
						canAddDealer: toBooleanFromBit(dr["CanAddDealer"]),
						canDeleteUser: toBooleanFromBit(dr["CanDeleteUser"]),
						canChangeAccountType: toBooleanFromBit(
							dr["CanChangeAccountType"],
						),
						notifyBefore3Days: toBooleanFromBit(
							dr["NotifyBefore3Days"],
						),
						notifyBefore2Days: toBooleanFromBit(
							dr["NotifyBefore2Days"],
						),
						notifyBefore1Day: toBooleanFromBit(
							dr["NotifyBefore1Day"],
						),
						extraGb: toBooleanFromBit(dr["ExtraGB"]),
						canShowOnlineUsersSpeed: toBooleanFromBit(
							dr["CanShowOnlineUsersSpeed"],
						),
						userNotification: toBooleanFromBit(
							dr["UserNotification"],
						),
						canMonitorLog: toBooleanFromBit(dr["CanMonitorLog"]),
						chargeIfNotExpiry: toBooleanFromBit(
							dr["ChargeIfNotExpiry"],
						),
						status: dr["Archived"]
							? ("INACTIVE" as const)
							: ("ACTIVE" as const),
					};

					try {
						if (existing) {
							dealerMap.set(dealerUserId, existing);
							const wasDeleted =
								dealerDeletedAtByExtId.get(extId) !== null &&
								dealerDeletedAtByExtId.get(extId) !== undefined;
							await db.ispDealer.update({
								where: { id: existing },
								data: {
									...dealerData,
									lastSyncedAt: new Date(),
									deletedAt: null,
								},
							});
							if (wasDeleted) {
								result.dealers.restored++;
							}
							result.dealers.updated++;
						} else {
							const created = await db.ispDealer.create({
								data: {
									...dealerData,
									lastSyncedAt: new Date(),
								},
							});
							dealerMap.set(dealerUserId, created.id);
							result.dealers.created++;
						}
					} catch (error) {
						result.dealers.errors++;
						if (result.errors.length < 50) {
							result.errors.push({
								phase: "dealers",
								detail: `Dealer ${dealerUserId} "${dr["UserName"]}": ${error instanceof Error ? error.message : "Unknown"}`,
							});
						}
					}

					if (i > 0 && i % 100 === 0) {
						await updateProgress(operationId, {
							processedDealers: i,
						});
					}
				}

				// Pass 2: Resolve dealer parent hierarchy (batched)
				const parentUpdates = [];
				for (const dr of dealerRows) {
					if (!dr) {
						continue;
					}
					const parentId = dr["ParentId"] as number | null;
					if (!parentId) {
						continue;
					}
					const dealerUserId = dr["Id"] as number;
					const myId = dealerMap.get(dealerUserId);
					const parentDealerId = dealerMap.get(parentId);
					if (myId && parentDealerId) {
						parentUpdates.push(
							db.ispDealer.update({
								where: { id: myId },
								data: { parentDealerId },
							}),
						);
					}
				}
				if (parentUpdates.length > 0) {
					await db.$transaction(parentUpdates).catch((error) => {
						logger.warn(
							"[iRadius Sync] Dealer parent resolution partially failed",
							{ error },
						);
					});
				}

				await updateProgress(operationId, {
					processedDealers: dealerRows.length,
				});

				// Cleanup: soft-delete dealers no longer in iRadius. Scope is
				// GLOBAL because dealers are not org-scoped at the table level.
				// Hard delete is unsafe — IspDealerAccount rows cascade-delete
				// from a dealer (real financial history), and Customer /
				// Employee / ServicePlan FKs SetNull but we want the dealer name
				// preserved for historical reporting.
				result.dealers.removed = await softDeleteStaleRecords({
					delegate: db.ispDealer,
					existing: existingDealers,
					seenExtIds: seenDealerExtIds,
					timestamp: new Date(),
				});

				// Sub-phase: Dealer Accounts
				const dealerAccountRows = await queryIRadius(
					conn,
					"SELECT Id, DealerId, Credit, Debit, OperationDate, Comment, Balance FROM DealerAccount ORDER BY DealerId, OperationDate",
				);

				await updateProgress(operationId, {
					totalDealerAccounts: dealerAccountRows.length,
				});

				const batchSize = 500;
				let processedDealerAccounts = 0;

				for (let i = 0; i < dealerAccountRows.length; i += batchSize) {
					const batch = dealerAccountRows.slice(i, i + batchSize);
					const createData = [];

					for (const da of batch) {
						const dealerId = dealerMap.get(
							da["DealerId"] as number,
						);
						if (!dealerId) {
							result.dealerAccounts.skipped++;
							continue;
						}

						const operationDate = safeDate(da["OperationDate"]);
						if (!operationDate) {
							result.dealerAccounts.skipped++;
							continue;
						}

						createData.push({
							dealerId,
							externalId: String(da["Id"]),
							credit: (da["Credit"] as number) ?? 0,
							debit: (da["Debit"] as number) ?? 0,
							balance: (da["Balance"] as number) ?? 0,
							comment: (da["Comment"] as string) ?? null,
							operationDate,
						});
					}

					if (createData.length > 0) {
						try {
							const created =
								await db.ispDealerAccount.createMany({
									data: createData,
									skipDuplicates: true,
								});
							result.dealerAccounts.created += created.count;
						} catch (error) {
							result.dealerAccounts.errors++;
							if (result.errors.length < 50) {
								result.errors.push({
									phase: "dealerAccounts",
									detail: `Batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : "Unknown"}`,
								});
							}
						}
					}

					processedDealerAccounts += batch.length;
					if (
						processedDealerAccounts % 100 === 0 ||
						i + batchSize >= dealerAccountRows.length
					) {
						await updateProgress(operationId, {
							processedDealerAccounts,
						});
					}
				}

				await updateProgress(operationId, {
					processedDealerAccounts: dealerAccountRows.length,
				});

				// In dealers-only mode, we're done — skip remaining phases
				return result;
			}

			// Get the org's assigned dealer — used as fallback for records without a resolvable parent
			const orgRecord = await db.organization.findUnique({
				where: { id: organizationId },
				select: { activeDealerId: true },
			});
			const activeDealerId = orgRecord?.activeDealerId ?? null;

			// Build a lookup from iRadius dealer User.Id → our IspDealer.id
			// so we can resolve ParentId on employees/customers to the correct dealer
			const allDealers = await db.ispDealer.findMany({
				where: { externalId: { not: null } },
				select: { id: true, externalId: true },
			});
			for (const d of allDealers) {
				if (d.externalId) {
					dealerMap.set(Number(d.externalId), d.id);
				}
			}

			await updateProgress(operationId, {
				totalDealers: 0,
				processedDealers: 0,
			});

			// Backfill dealerId on service plans that have dealerExternalId but no dealerId
			const plansToBackfill = await db.servicePlan.findMany({
				where: {
					organizationId,
					dealerId: null,
					dealerExternalId: { not: null },
				},
				select: { id: true, dealerExternalId: true },
			});
			await Promise.all(
				plansToBackfill.flatMap((plan) => {
					const resolvedDealerId = dealerMap.get(
						Number(plan.dealerExternalId),
					);
					if (!resolvedDealerId) {
						return [];
					}
					return db.servicePlan
						.update({
							where: { id: plan.id },
							data: { dealerId: resolvedDealerId },
						})
						.catch(() => {});
				}),
			);

			// ================================================================
			// Phase 7: Employees
			// ================================================================
			await updateProgress(operationId, { phase: "employees" });

			const employeeRows = await queryIRadius(
				conn,
				`SELECT u.Id, u.UserName, u.FirstName, u.LastName, u.Mobile, u.Phone,
					u.MailAddress, u.ParentId, u.ProfileId, u.CreationDate
				FROM User u
				WHERE u.ProfileId IN (1, 3, 6, 7, 8)
				ORDER BY u.Id`,
			);

			await updateProgress(operationId, {
				totalEmployees: employeeRows.length,
			});

			const employeeMap = new Map<number, string>();
			const existingEmployees = await db.employee.findMany({
				where: {
					organizationId,
					externalId: { not: null },
				},
				select: { id: true, externalId: true, deletedAt: true },
			});
			const employeeByExtId = new Map(
				existingEmployees.map((e) => [e.externalId, e.id]),
			);
			const employeeDeletedAtByExtId = new Map(
				existingEmployees.map((e) => [e.externalId, e.deletedAt]),
			);
			const seenEmployeeExtIds = new Set<string>();

			// Unlinked-by-username map for employees, mirroring the customer
			// loop above. Lets the sync claim a locally-created employee row
			// (e.g. from a manual seed or the org's onboarding flow) instead
			// of creating a duplicate. Ambiguous usernames are left alone.
			const unlinkedEmployeesByUsername = await (async () => {
				const rows = await db.employee.findMany({
					where: {
						organizationId,
						externalId: null,
						username: { not: null },
					},
					select: { id: true, username: true },
				});
				const map = new Map<string, string | "ambiguous">();
				for (const row of rows) {
					const key = row.username?.toLowerCase();
					if (!key) {
						continue;
					}
					map.set(key, map.has(key) ? "ambiguous" : row.id);
				}
				return map;
			})();

			const nextEmployeeNumber =
				await createEmployeeNumberGenerator(organizationId);

			for (let i = 0; i < employeeRows.length; i++) {
				const emp = employeeRows[i];
				if (!emp) {
					continue;
				}
				const empUserId = emp["Id"] as number;
				const extId = String(empUserId);
				seenEmployeeExtIds.add(extId);
				let existingId = employeeByExtId.get(extId);

				if (!existingId) {
					const candidateUsername = (
						emp["UserName"] as string | null
					)?.toLowerCase();
					const claim = candidateUsername
						? unlinkedEmployeesByUsername.get(candidateUsername)
						: undefined;
					if (claim && claim !== "ambiguous") {
						await db.employee.update({
							where: { id: claim },
							data: { externalId: extId },
						});
						existingId = claim;
						employeeByExtId.set(extId, claim);
						if (candidateUsername) {
							unlinkedEmployeesByUsername.delete(
								candidateUsername,
							);
						}
					}
				}
				const profileId = emp["ProfileId"] as number;

				// Resolve dealer from iRadius ParentId hierarchy, fall back to org's active dealer
				const parentId = emp["ParentId"] as number | null;
				const empDealerId =
					(parentId ? dealerMap.get(parentId) : null) ??
					activeDealerId;

				const employeeData = {
					name:
						[emp["FirstName"], emp["LastName"]]
							.filter(Boolean)
							.join(" ")
							.trim() || "Unknown",
					email: (emp["MailAddress"] as string) || null,
					phone:
						(emp["Mobile"] as string) ||
						(emp["Phone"] as string) ||
						null,
					externalId: extId,
					username: (emp["UserName"] as string) || null,
					iRadiusProfile: PROFILE_POSITION_MAP[profileId] ?? null,
					department: PROFILE_DEPARTMENT_MAP[profileId] ?? null,
					position: PROFILE_POSITION_MAP[profileId] ?? null,
					hireDate: safeDate(emp["CreationDate"]),
					dealerId: empDealerId,
				};

				try {
					let empRecordId: string;
					if (existingId) {
						employeeMap.set(empUserId, existingId);
						const wasDeleted =
							employeeDeletedAtByExtId.get(extId) !== null &&
							employeeDeletedAtByExtId.get(extId) !== undefined;
						await db.employee.update({
							where: { id: existingId },
							data: {
								...employeeData,
								lastSyncedAt: new Date(),
								deletedAt: null,
							},
						});
						if (wasDeleted) {
							result.employees.restored++;
						}
						empRecordId = existingId;
						result.employees.updated++;
					} else {
						const employeeNumber = nextEmployeeNumber();
						const created = await db.employee.create({
							data: {
								organizationId,
								employeeNumber,
								preferredLayout: "collector",
								lastSyncedAt: new Date(),
								...employeeData,
							},
						});
						employeeMap.set(empUserId, created.id);
						empRecordId = created.id;
						result.employees.created++;
					}

					// Auto-create User + Member for this employee
					await ensureEmployeeMembership(
						empRecordId,
						employeeData.email,
						employeeData.name,
						organizationId,
						profileId,
					);
				} catch (error) {
					result.employees.errors++;
					if (result.errors.length < 50) {
						result.errors.push({
							phase: "employees",
							detail: `Employee ${empUserId} "${emp["UserName"]}": ${error instanceof Error ? error.message : "Unknown"}`,
						});
					}
				}

				if (i > 0 && i % 100 === 0) {
					await updateProgress(operationId, {
						processedEmployees: i,
					});
				}
			}

			await updateProgress(operationId, {
				processedEmployees: employeeRows.length,
			});

			// Cleanup: soft-delete employees whose iRadius User row is gone.
			// Same soft-delete rationale as customers — Payment.collectorId /
			// workerId references can still point at the row.
			result.employees.removed = await softDeleteStaleRecords({
				delegate: db.employee,
				existing: existingEmployees,
				seenExtIds: seenEmployeeExtIds,
				timestamp: new Date(),
			});

			// ================================================================
			// Phase 8: Customers (only ProfileId = 4)
			// ================================================================
			await updateProgress(operationId, { phase: "customers" });

			// Resolve which iRadius dealers belong to this org's subtree so we
			// only import customers we're allowed to manage. Without this,
			// every org syncs every iRadius customer and a subsequent push
			// overwrites another dealer's `User.Mobile` (see sakonet incident
			// 2026-05-08). The set contains the active dealer's iRadius
			// `User.Id` plus any sub-dealers whose `User.ParentId` points at
			// it. We treat the active dealer's *iRadius* extId as the root —
			// our local `IspDealer.parentDealerId` is mirrored from the same
			// hierarchy but lives a sync behind, so reading the source of
			// truth from iRadius keeps the filter consistent across runs.
			const allowedIRadiusDealerExtIds = new Set<number>();
			if (activeDealerId !== null) {
				const activeDealer = await db.ispDealer.findUnique({
					where: { id: activeDealerId },
					select: { externalId: true },
				});
				const activeDealerExtId = activeDealer?.externalId
					? Number(activeDealer.externalId)
					: null;
				if (activeDealerExtId !== null) {
					allowedIRadiusDealerExtIds.add(activeDealerExtId);
					const subDealers = await queryIRadius(
						conn,
						"SELECT Id FROM User WHERE ProfileId = 2 AND ParentId = ?",
						[activeDealerExtId],
					);
					for (const row of subDealers) {
						const subId = row["Id"] as number | null;
						if (subId !== null) {
							allowedIRadiusDealerExtIds.add(subId);
						}
					}
				}
			}

			const users = await queryIRadius(
				conn,
				`SELECT u.Id AS Id, u.UserName, u.FirstName, u.LastName, u.Mobile, u.Phone,
					u.MailAddress, u.Address, u.Comment, u.AccountPrice, u.Discount,
					u.Archived, u.CreationDate, u.CollectorId, u.ParentId, u.UserGroupId,
					u.MOF, u.LastLogin, u.LastLogOut AS UserLastLogOut,
					u.AutoGenerateInvoice, u.FinancialCategoryId, u.LinkId,
					u.CanResetAccount, u.CollectorResetMacAddress, u.CollectorCanShowLinks, u.ReadOnly,
					c.FirstName as CollectorFirstName, c.LastName as CollectorLastName,
					c.Phone as CollectorMobile,
					uc.Name as CategoryName, ug.Name as GroupName,
					un.Id AS NasAccountId,
					un.AccountTypeId, un.ActivatedAccount, un.ExpiryAccount,
					un.StaticIP, un.IpAddress, un.MacAddress, un.NasHost,
					un.Online, un.Active, un.Blocked, un.FupMode,
					un.DownloadBytes, un.UploadBytes,
					un.DailyDownloadBytes, un.DailyUploadBytes,
					un.AutomaticRenew, un.IPTVPRICE, un.REALIPPRICE,
					un.StationId, un.AccessPointId,
					un.GSMLat, un.GSMLng, un.MikrotikInterface, un.MikrotikUser,
					un.FreeDownloadBytes, un.FreeUploadBytes,
					un.ExtraDaysToAddWhenRefill, un.ExtraDaysToDeductWhenRefill,
					un.AddedHours, un.ExtraUploadGB, un.ExtraDownloadGB, un.CanShowTraficDetails,
					un.OldAccountTypeId, un.ForwardAccountTypeId, un.ConditionAccountTypeId,
					un.DeductMoney, un.ReachMaxQuota, un.TempUser,
					un.TempExpiryAccount, un.MikrotikQueue, un.WirelessInterface, un.RouterBrandPrefix,
					un.OverrideExpiryAccount, un.ForceExpiryAfterDays,
					un.ForceOverrideImmediatlyRecharge, un.OverrideImmediatlyRecharge,
					un.ForceAutoBindAccToMac, un.OverrideAutoBindAccToMac, un.Simultaneous,
					un.APElectrical,
					un.ExcludeDailyDownloadBytes, un.ExcludeDailyUploadBytes,
					un.ExcludeMontlyDownloadBytes, un.ExcludeMontlyUploadBytes,
					un.FreeDailyDownloadBytes, un.FreeDailyUploadBytes,
					un.ExcludeFreeDailyDownloadBytes, un.ExcludeFreeMontlyDownloadBytes,
					un.ExcludeFreeDailyUploadBytes, un.ExcludeFreeMontlyUploadBytes,
					un.LastLogOut AS NasLastLogOut, un.MikrotikInterface1
				FROM User u
				LEFT JOIN UserNas un ON un.UserId = u.Id
				LEFT JOIN User c ON c.Id = u.CollectorId
				LEFT JOIN UserCategory uc ON uc.Id = u.UserCategoryId
				LEFT JOIN UserGroup ug ON ug.Id = u.UserGroupId
				WHERE u.ProfileId = 4
				ORDER BY u.Id`,
			);

			await updateProgress(operationId, {
				totalCustomers: users.length,
			});

			// Also get orphaned user IDs (referenced by financial records)
			const orphanIds = await queryIRadius(
				conn,
				`SELECT DISTINCT sub.UserId AS Id FROM (
					SELECT UserId FROM UserBalance WHERE UserId NOT IN (SELECT Id FROM User)
					UNION
					SELECT UserId FROM Invoice WHERE UserId NOT IN (SELECT Id FROM User)
				) sub`,
			);

			// Load existing customers for conflict detection (full records)
			const existingCustomers = await db.customer.findMany({
				where: {
					organizationId,
					externalId: { not: null },
				},
			});
			// Full record map for conflict comparison
			const customerRecordByExtId = new Map(
				existingCustomers
					.filter((c) => c.externalId != null)
					.map((c) => [c.externalId, c]),
			);
			// Lightweight ID map for transaction/invoice phases
			const customerByExtId = new Map(
				existingCustomers
					.filter((c) => c.externalId != null)
					.map((c) => [c.externalId, c.id]),
			);
			// Lightweight {id, externalId, deletedAt} projection used by the
			// soft-delete cleanup helper at end-of-phase. Built once here so
			// the helper doesn't re-query the table.
			const existingCustomersForCleanup = existingCustomers
				.filter(
					(c): c is typeof c & { externalId: string } =>
						c.externalId !== null,
				)
				.map((c) => ({
					id: c.id,
					externalId: c.externalId,
					deletedAt: c.deletedAt,
				}));
			// `seenCustomerExtIds` is added to ONLY for customers we actually
			// processed (created, updated, or claimed). Customers skipped by
			// the cross-dealer guard below are intentionally NOT added — that
			// way the end-of-phase cleanup soft-deletes them from this org.
			// This is the fix for the dotnet2 / eliedebel case: customers
			// whose iRadius `ParentId` now sits outside the org's allowed
			// dealer subtree will be removed from the org's view on the next
			// sync, instead of lingering with a stale `dealerId`.
			const seenCustomerExtIds = new Set<string>();

			// iRadius dealers that own customers in our scope but have no local
			// `IspDealer` row. Collected rather than guessed at, and reported as
			// a sync error so the operator knows to run a dealers-only sync.
			const unresolvedDealerExtIds = new Set<number>();

			// Unlinked-by-username map: locally-created rows (externalId IS NULL)
			// that we'll try to claim by matching iRadius UserName. Only single-
			// occurrence usernames are eligible — ambiguous matches (the same
			// username on multiple unlinked rows) stay unclaimed so we never
			// guess which row owns an iRadius identity.
			const unlinkedByUsername = await (async () => {
				const rows = await db.customer.findMany({
					where: {
						organizationId,
						externalId: null,
						username: { not: null },
					},
				});
				const map = new Map<
					string,
					(typeof rows)[number] | "ambiguous"
				>();
				for (const row of rows) {
					const key = row.username?.toLowerCase();
					if (!key) {
						continue;
					}
					map.set(key, map.has(key) ? "ambiguous" : row);
				}
				return map;
			})();

			// Supersede unresolved conflicts from prior sync operations
			await db.syncConflict.deleteMany({
				where: {
					organizationId,
					status: "pending",
					syncOperationId: { not: operationId },
				},
			});

			const nextAccountNumber =
				await createAccountNumberGenerator(organizationId);

			const syncTimestamp = new Date();

			for (let i = 0; i < users.length; i++) {
				const u = users[i];
				if (!u) {
					continue;
				}
				const userId = u["Id"] as number | null;
				if (userId == null) {
					continue;
				}
				const extId = String(userId);
				let existing = customerRecordByExtId.get(extId);

				// Username-fallback claim: if no externalId match, try to adopt
				// a local-only row with the same (lowered) username. This
				// reunites rows created locally (e.g. via an import script)
				// with their iRadius identity instead of creating a duplicate.
				// Ambiguous usernames (multiple unlinked rows) are skipped so
				// we never guess which row owns the iRadius id.
				if (!existing) {
					const candidateUsername = (
						u["UserName"] as string | null
					)?.toLowerCase();
					const candidate = candidateUsername
						? unlinkedByUsername.get(candidateUsername)
						: undefined;
					if (candidate && candidate !== "ambiguous") {
						const claimed = await db.customer.update({
							where: { id: candidate.id },
							data: { externalId: extId },
						});
						existing = claimed;
						customerRecordByExtId.set(extId, claimed);
						customerByExtId.set(extId, claimed.id);
						if (candidateUsername) {
							unlinkedByUsername.delete(candidateUsername);
						}
					}
				}

				const planName = u["AccountTypeId"]
					? planNames.get(u["AccountTypeId"] as number)
					: null;
				const planId = u["AccountTypeId"]
					? (planMap.get(u["AccountTypeId"] as number) ?? null)
					: null;
				const stationId = u["StationId"]
					? (stationMap.get(u["StationId"] as number) ?? null)
					: null;
				const accessPointId = u["AccessPointId"]
					? (apMap.get(u["AccessPointId"] as number) ?? null)
					: null;

				// Resolve dealer from iRadius ParentId, fall back to org's active dealer
				const custParentId = u["ParentId"] as number | null;

				// Cross-dealer guard: if this iRadius customer is parented to
				// a dealer outside our org's allowed subtree, skip the row
				// entirely (no insert, no update). ParentId === 1 means the
				// admin user and null/0 means no parent at all; neither occurs
				// for ProfileId = 4 in production, but both fall through to
				// the activeDealerId fallback as they always have.
				//
				// The guard deliberately does NOT require the parent to be a
				// dealer we already know locally. It used to, and that was the
				// hole: a customer under a dealer with no `IspDealer` row fell
				// straight through to `?? activeDealerId` and was claimed by
				// whichever org happened to sync. `hayanetbh2` (iRadius 84313)
				// was created upstream without a dealers-only sync since, so
				// on 2026-08-28 its 26 subscribers were imported into dotnet2
				// and shown to its owner as his own. An unknown parent is the
				// case where we are LEAST entitled to claim a customer.
				//
				// NOTE: when this guard fires we deliberately do NOT add the
				// extId to `seenCustomerExtIds`. End-of-phase cleanup will
				// then soft-delete this row from our DB if it's currently
				// here, which is what we want — the customer now belongs to a
				// dealer outside this org's subtree.
				const hasRealParent =
					custParentId !== null &&
					custParentId !== 0 &&
					custParentId !== 1;

				if (
					hasRealParent &&
					allowedIRadiusDealerExtIds.size > 0 &&
					!allowedIRadiusDealerExtIds.has(custParentId)
				) {
					continue;
				}

				// In scope, but we cannot name the dealer locally. Claiming it
				// under `activeDealerId` would mis-attribute the customer, so
				// skip and surface it — the fix is a dealers-only sync.
				if (hasRealParent && !dealerMap.has(custParentId)) {
					unresolvedDealerExtIds.add(custParentId);
					continue;
				}

				// Past the guard — this customer belongs to us. Mark seen so
				// it survives the end-of-phase cleanup.
				seenCustomerExtIds.add(extId);

				const dealerId =
					(custParentId ? dealerMap.get(custParentId) : null) ??
					activeDealerId;
				const collectorExtId = u["CollectorId"] as number | null;
				const collectorId = collectorExtId
					? (employeeMap.get(collectorExtId) ?? null)
					: null;
				const nasHost = (u["NasHost"] as string) || null;
				const nasId = nasHost
					? (nasHostMap.get(nasHost) ?? null)
					: null;

				const collectorFirst = u["CollectorFirstName"] as string | null;
				const collectorLast = u["CollectorLastName"] as string | null;
				const collectorName =
					[collectorFirst, collectorLast]
						.filter(Boolean)
						.join(" ")
						.trim() || null;

				const customerData = {
					firstName: (u["FirstName"] as string) || null,
					lastName: (u["LastName"] as string) || null,
					email: (u["MailAddress"] as string) || null,
					mobile:
						extractPhoneNumbers(u["Mobile"] as string)[0] ?? null,
					phone: extractPhoneNumbers(u["Phone"] as string)[0] ?? null,
					phones: JSON.parse(
						JSON.stringify(
							buildPhonesFromSync(
								(u["Mobile"] as string) || null,
								(u["Phone"] as string) || null,
							),
						),
					),
					address: (u["Address"] as string) || null,
					username: (u["UserName"] as string) || null,
					planId,
					stationId,
					accessPointId,
					dealerId,
					collectorId,
					nasId,
					originalCreatedAt: safeDate(u["CreationDate"]),
					status: deriveStatus(
						u["Archived"] as number,
						u["Active"] as number,
						u["Blocked"] as number,
					),
					connectionType: inferConnectionType(planName),
					ipAddress:
						(u["IpAddress"] as string) ||
						(u["StaticIP"] as string) ||
						null,
					macAddress: (u["MacAddress"] as string) || null,
					monthlyRate: (u["AccountPrice"] as number) ?? null,
					notes: (u["Comment"] as string) || null,
					externalId: extId,
					activatedAt: safeDate(u["ActivatedAccount"]),
					expiresAt: safeDate(u["ExpiryAccount"]),
					staticIp: (u["StaticIP"] as string) || null,
					nasHost,
					mikrotikUser: (u["MikrotikUser"] as string) || null,
					mikrotikInterface:
						(u["MikrotikInterface"] as string) || null,
					online: toBooleanFromBit(u["Online"]),
					downloadBytes: toBigInt(u["DownloadBytes"]),
					uploadBytes: toBigInt(u["UploadBytes"]),
					dailyDownloadBytes: toBigInt(u["DailyDownloadBytes"]),
					dailyUploadBytes: toBigInt(u["DailyUploadBytes"]),
					fupMode: Buffer.isBuffer(u["FupMode"])
						? u["FupMode"].toString("utf8").replace(/\0/g, "") ||
							null
						: (u["FupMode"] as string) || null,
					automaticRenew: toBooleanFromBit(u["AutomaticRenew"]),
					iptvPrice: (u["IPTVPRICE"] as number) ?? 0,
					realIpPrice: (u["REALIPPRICE"] as number) ?? 0,
					discount: (u["Discount"] as number) ?? 0,
					latitude: (u["GSMLat"] as number) || null,
					longitude: (u["GSMLng"] as number) || null,
					categoryName: (u["CategoryName"] as string) || null,
					groupName: (u["GroupName"] as string) || null,
					groupExternalId: (u["UserGroupId"] as number) ?? null,
					collectorName,
					collectorPhone: (u["CollectorMobile"] as string) || null,
					// iRadius User fields
					mof: (u["MOF"] as string) || null,
					lastLogin: safeDate(u["LastLogin"]),
					lastLogOut: safeDate(u["UserLastLogOut"]),
					autoGenerateInvoice: toBooleanFromBit(
						u["AutoGenerateInvoice"],
					),
					financialCategoryId:
						(u["FinancialCategoryId"] as number) ?? null,
					linkId: (u["LinkId"] as number) ?? null,
					canResetAccount: toBooleanFromBit(u["CanResetAccount"]),
					collectorResetMac: toBooleanFromBit(
						u["CollectorResetMacAddress"],
					),
					collectorCanShowLinks: toBooleanFromBit(
						u["CollectorCanShowLinks"],
					),
					readOnly: toBooleanFromBit(u["ReadOnly"]),
					// iRadius UserNas fields
					nasAccountId: (u["NasAccountId"] as number) ?? null,
					freeDownloadBytes: toBigInt(u["FreeDownloadBytes"]),
					freeUploadBytes: toBigInt(u["FreeUploadBytes"]),
					extraDaysToAddOnRefill:
						(u["ExtraDaysToAddWhenRefill"] as number) ?? null,
					extraDaysToDeductOnRefill:
						(u["ExtraDaysToDeductWhenRefill"] as number) ?? null,
					addedHours: (u["AddedHours"] as number) ?? null,
					extraUploadGb: (u["ExtraUploadGB"] as number) ?? null,
					extraDownloadGb: (u["ExtraDownloadGB"] as number) ?? null,
					canShowTrafficDetails: toBooleanFromBit(
						u["CanShowTraficDetails"],
					),
					oldAccountTypeId: (u["OldAccountTypeId"] as number) ?? null,
					forwardAccountTypeId:
						(u["ForwardAccountTypeId"] as number) ?? null,
					conditionAccountTypeId:
						(u["ConditionAccountTypeId"] as number) ?? null,
					deductMoney: (u["DeductMoney"] as number) ?? null,
					reachMaxQuota: toBooleanFromBit(u["ReachMaxQuota"]),
					tempUser: toBooleanFromBit(u["TempUser"]),
					tempExpiryAccount: safeDate(u["TempExpiryAccount"]),
					mikrotikQueue: (u["MikrotikQueue"] as string) || null,
					wirelessInterface:
						(u["WirelessInterface"] as string) || null,
					routerBrandPrefix:
						(u["RouterBrandPrefix"] as string) || null,
					overrideExpiryAccount: safeDate(u["OverrideExpiryAccount"]),
					forceExpiryAfterDays:
						(u["ForceExpiryAfterDays"] as number) ?? null,
					forceOverrideImmediateRecharge: toBooleanFromBit(
						u["ForceOverrideImmediatlyRecharge"],
					),
					overrideImmediateRecharge: toBooleanFromBit(
						u["OverrideImmediatlyRecharge"],
					),
					forceAutoBindAccToMac: toBooleanFromBit(
						u["ForceAutoBindAccToMac"],
					),
					overrideAutoBindAccToMac: toBooleanFromBit(
						u["OverrideAutoBindAccToMac"],
					),
					simultaneous: toBooleanFromBit(u["Simultaneous"]),
					apElectrical: toBooleanFromBit(u["APElectrical"]),
					excludeDailyDownloadBytes: toBigInt(
						u["ExcludeDailyDownloadBytes"],
					),
					excludeDailyUploadBytes: toBigInt(
						u["ExcludeDailyUploadBytes"],
					),
					excludeMonthlyDownloadBytes: toBigInt(
						u["ExcludeMontlyDownloadBytes"],
					),
					excludeMonthlyUploadBytes: toBigInt(
						u["ExcludeMontlyUploadBytes"],
					),
					freeDailyDownloadBytes: toBigInt(
						u["FreeDailyDownloadBytes"],
					),
					freeDailyUploadBytes: toBigInt(u["FreeDailyUploadBytes"]),
					excludeFreeDailyDownloadBytes: toBigInt(
						u["ExcludeFreeDailyDownloadBytes"],
					),
					excludeFreeMonthlyDownloadBytes: toBigInt(
						u["ExcludeFreeMontlyDownloadBytes"],
					),
					excludeFreeDailyUploadBytes: toBigInt(
						u["ExcludeFreeDailyUploadBytes"],
					),
					excludeFreeMonthlyUploadBytes: toBigInt(
						u["ExcludeFreeMontlyUploadBytes"],
					),
					nasLastLogOut: safeDate(u["NasLastLogOut"]),
					mikrotikInterface1:
						(u["MikrotikInterface1"] as string) || null,
				};

				try {
					if (existing) {
						const conflictFields: Record<string, ConflictField> =
							{};
						const autoUpdateData: Record<string, unknown> = {};
						let hasAutoUpdates = false;
						const existingRecord = existing as Record<
							string,
							unknown
						>;

						for (const [key, remoteVal] of Object.entries(
							customerData,
						)) {
							if (key === "externalId") {
								continue;
							}

							// Local is authoritative for these fields (latitude,
							// longitude, notes). Never overwrite or generate a
							// conflict — iRadius's value is ignored after create.
							if (LOCAL_AUTHORITATIVE_FIELDS.has(key)) {
								continue;
							}

							if (isAutoUpdateField(key)) {
								autoUpdateData[key] = remoteVal;
								if (
									!hasAutoUpdates &&
									!valuesEqual(existingRecord[key], remoteVal)
								) {
									hasAutoUpdates = true;
								}
							} else if (isConflictTrackedField(key)) {
								if (
									!valuesEqual(existingRecord[key], remoteVal)
								) {
									conflictFields[key] = {
										local: serializeValue(
											existingRecord[key],
										),
										remote: serializeValue(remoteVal),
										resolution: null,
									};
								}
							} else {
								autoUpdateData[key] = remoteVal;
								if (
									!hasAutoUpdates &&
									!valuesEqual(existingRecord[key], remoteVal)
								) {
									hasAutoUpdates = true;
								}
							}
						}

						// Restore: if this customer was previously soft-deleted by
						// an earlier cleanup run but is back in iRadius (and
						// inside the dealer subtree), clear `deletedAt`.
						if (existing.deletedAt !== null) {
							autoUpdateData["deletedAt"] = null;
							hasAutoUpdates = true;
							result.customers.restored++;
						}

						// Cycle baseline: iRadius doesn't expose a "this-cycle
						// usage" counter, only lifetime + daily, so we snapshot
						// the lifetime byte counters whenever a renewal lands
						// (ExpiryAccount bumps forward by ≥20 days — anything
						// smaller is an admin tweak, not a billing renewal) and
						// once at first sight to seed the baseline. Monthly
						// usage in the UI then = currentBytes − cycleStartBytes.
						const newExpiresAt = customerData.expiresAt;
						const existingExpiresAt = existingRecord[
							"expiresAt"
						] as Date | null;
						const existingCycleStartedAt = existingRecord[
							"cycleStartedAt"
						] as Date | null;
						const RENEWAL_MIN_MS = 20 * 24 * 60 * 60 * 1000;
						const renewed =
							newExpiresAt != null &&
							existingExpiresAt != null &&
							newExpiresAt.getTime() -
								existingExpiresAt.getTime() >=
								RENEWAL_MIN_MS;
						const needsSeed = existingCycleStartedAt == null;
						if (renewed || needsSeed) {
							autoUpdateData["cycleStartedAt"] = syncTimestamp;
							autoUpdateData["cycleStartDownloadBytes"] =
								customerData.downloadBytes;
							autoUpdateData["cycleStartUploadBytes"] =
								customerData.uploadBytes;
							hasAutoUpdates = true;
						}

						if (
							hasAutoUpdates ||
							Object.keys(conflictFields).length > 0
						) {
							autoUpdateData["lastSyncedAt"] = syncTimestamp;
							await db.customer.update({
								where: { id: existing.id },
								data: autoUpdateData,
							});
						}

						// Create conflict record if any tracked fields differ
						if (Object.keys(conflictFields).length > 0) {
							await db.syncConflict.upsert({
								where: {
									syncOperationId_customerId: {
										syncOperationId: operationId,
										customerId: existing.id,
									},
								},
								create: {
									organizationId,
									syncOperationId: operationId,
									customerId: existing.id,
									externalId: extId,
									fields: conflictFields as unknown as Prisma.InputJsonValue,
									status: "pending",
								},
								update: {
									fields: conflictFields as unknown as Prisma.InputJsonValue,
									status: "pending",
									resolvedAt: null,
									resolvedById: null,
								},
							});
							result.customers.conflicted++;
						} else {
							result.customers.updated++;
						}
					} else {
						// ----- New customer — create directly -----
						const accountNumber = nextAccountNumber();
						const created = await db.customer.create({
							data: {
								organizationId,
								accountNumber,
								lastSyncedAt: syncTimestamp,
								...customerData,
								// Seed cycle at first sight. Their cycle
								// actually started earlier (somewhere between
								// activatedAt and now), so the first cycle's
								// monthly bar will under-report — next renewal
								// rights it.
								cycleStartedAt: syncTimestamp,
								cycleStartDownloadBytes:
									customerData.downloadBytes,
								cycleStartUploadBytes: customerData.uploadBytes,
							},
						});
						customerByExtId.set(extId, created.id);
						result.customers.created++;
					}
				} catch (error) {
					result.customers.errors++;
					if (result.errors.length < 50) {
						result.errors.push({
							phase: "customers",
							detail: `User ${userId} "${u["UserName"]}": ${error instanceof Error ? error.message : "Unknown"}`,
						});
					}
				}

				if (i > 0 && i % 100 === 0) {
					await updateProgress(operationId, {
						processedCustomers: i,
					});
				}
			}

			// Which orphaned iRadius users THIS org actually has a financial
			// back-reference to. An orphan has no `User` row and therefore no
			// `ParentId`, so the cross-dealer guard above cannot classify it —
			// this map is the dealer scope for orphans.
			//
			// Without it the loop created a stub for every orphan in every org:
			// 7,230 orphaned ids in iRadius `Invoice`/`UserBalance` produced
			// ~7,000 "Deleted user" rows in each of the six orgs, none of which
			// anchored anything (billing-sync links by `username`, which a stub
			// does not have, and nothing reads `externalUserId`).
			const orphanBackRefs = new Map<string, string>();
			for (const ref of await db.dealerCharge.findMany({
				where: { organizationId, externalUserId: { not: null } },
				select: { externalUserId: true, dealerId: true },
				distinct: ["externalUserId"],
			})) {
				if (ref.externalUserId) {
					orphanBackRefs.set(ref.externalUserId, ref.dealerId);
				}
			}

			// Process orphaned users (iRadius IDs deleted from `User` but still
			// referenced by `UserBalance`/`Invoice` financial records).
			for (const orphan of orphanIds) {
				const userId = orphan["Id"] as number;
				const extId = String(userId);

				const existing = customerRecordByExtId.get(extId);
				if (existing) {
					// Does this org still have a reason to hold this row?
					//
					// A stub of our own is worth keeping only while a financial
					// record still points at it. A REAL customer is kept when
					// it sits under our own dealer — a row left over from a
					// pre-guard import under someone else's dealer must be
					// allowed to soft-delete like any other cross-dealer
					// customer. Previously being an orphan made a customer
					// permanently "seen" and so immune to cleanup, which is why
					// 17 of sakonet's, vipernet's and georgesabboud's
					// subscribers stayed live in dotnet2.
					const keep =
						existing.notes === ORPHAN_STUB_NOTES
							? orphanBackRefs.has(extId)
							: existing.dealerId === activeDealerId;
					if (!keep) {
						continue;
					}
					// Still ours — keep it through the end-of-phase cleanup.
					seenCustomerExtIds.add(extId);
					// Our own minimal stub, or already soft-deleted → nothing to
					// do; it stays as-is.
					if (
						existing.notes === ORPHAN_STUB_NOTES ||
						existing.deletedAt !== null
					) {
						continue;
					}
					// A real customer that was deleted on iRadius but still has
					// financial records. We keep it "seen" (above) so cleanup
					// doesn't silently soft-delete it; instead we surface an
					// admin-resolvable conflict (keep vs remove). If the admin
					// already chose to keep it in a prior run, don't re-ask.
					try {
						const acknowledged = await db.syncConflict.findFirst({
							where: {
								customerId: existing.id,
								status: "resolved",
								fields: {
									path: [IRADIUS_DELETED_FIELD, "resolution"],
									equals: "keep_local",
								},
							},
							select: { id: true },
						});
						if (acknowledged) {
							continue;
						}
						const deletedConflictFields = {
							[IRADIUS_DELETED_FIELD]: {
								local: "Active customer",
								remote: "Deleted on iRadius (financial records remain)",
								resolution: null,
							},
						} as unknown as Prisma.InputJsonValue;
						await db.syncConflict.upsert({
							where: {
								syncOperationId_customerId: {
									syncOperationId: operationId,
									customerId: existing.id,
								},
							},
							create: {
								organizationId,
								syncOperationId: operationId,
								customerId: existing.id,
								externalId: extId,
								fields: deletedConflictFields,
								status: "pending",
							},
							update: {
								fields: deletedConflictFields,
								status: "pending",
								resolvedAt: null,
								resolvedById: null,
							},
						});
						result.customers.conflicted++;
					} catch {
						result.customers.errors++;
					}
					continue;
				}

				// No local row. Only anchor an orphan this org actually has a
				// financial back-reference to — otherwise it is some other
				// dealer's deleted subscriber and a stub here is pure noise.
				const backRefDealerId = orphanBackRefs.get(extId);
				if (backRefDealerId === undefined) {
					continue;
				}

				seenCustomerExtIds.add(extId);

				// Create the minimal stub that anchors the financial
				// back-references, carrying the dealer from the charge that
				// referenced it so cleanup can scope it on later runs.
				try {
					const accountNumber = nextAccountNumber();
					const created = await db.customer.create({
						data: {
							organizationId,
							accountNumber,
							firstName: "Deleted",
							lastName: `User #${userId}`,
							externalId: extId,
							dealerId: backRefDealerId,
							status: "INACTIVE",
							notes: ORPHAN_STUB_NOTES,
							lastSyncedAt: syncTimestamp,
						},
					});
					customerByExtId.set(extId, created.id);
					result.customers.created++;
				} catch {
					result.customers.errors++;
				}
			}

			// Cleanup: soft-delete customers in this org whose iRadius `User`
			// row is either (a) gone entirely or (b) sits under a dealer
			// outside this org's allowed subtree. Hard delete is unsafe:
			// `Payment.customerId` and `Installation.customerId` cascade-delete
			// from a customer, which would wipe historical financial and
			// install records. Soft delete keeps the customer reachable by id
			// for those back-references while removing them from list views.
			if (unresolvedDealerExtIds.size > 0) {
				result.errors.push({
					phase: "customers",
					detail: `Skipped customers under ${unresolvedDealerExtIds.size} iRadius dealer(s) with no local record (${[...unresolvedDealerExtIds].join(", ")}). Run a dealers-only sync, then re-sync this organization.`,
				});
			}

			result.customers.removed = await softDeleteStaleRecords({
				delegate: db.customer,
				existing: existingCustomersForCleanup,
				seenExtIds: seenCustomerExtIds,
				timestamp: syncTimestamp,
			});

			// Update conflict count on the operation
			const conflictCount = await db.syncConflict.count({
				where: { syncOperationId: operationId, status: "pending" },
			});
			await updateProgress(operationId, {
				processedCustomers: users.length + orphanIds.length,
				totalConflicts: conflictCount,
			});

			// Phases 9 (UserBalance → customer_transaction) and 10
			// (Invoice → customer_invoice) have been removed. Transactions
			// are now derived from local Payment + CustomerInvoice rows in
			// list-transactions; invoices are generated locally by
			// `openBillingMonth` at billing-month start. The iRadius
			// invoice/transaction tables are no longer read.

			// ================================================================
			// Phase 11: Dealer charges (wholesale revenue)
			//
			// Runs on the NORMAL org sync, unlike the old dealer-account
			// sub-phase which only fired on a manual "dealers-only" run and had
			// therefore been stale since May 2026. This is roughly half the
			// company's income; it cannot depend on someone remembering to
			// press a button.
			//
			// Non-fatal by design: a failure here must never abort a customer
			// sync that already succeeded.
			// ================================================================
			if (organizationId) {
				await updateProgress(operationId, { phase: "dealerCharges" });
				try {
					result.dealerCharges = await syncDealerCharges(
						conn,
						organizationId,
					);
				} catch (error) {
					result.dealerCharges.errors++;
					result.errors.push({
						phase: "dealerCharges",
						detail:
							error instanceof Error
								? error.message
								: "Unknown error",
					});
				}
			}

			return result;
		});

		// Aggregate cleanup counts across phases. Per-entity breakdowns live
		// inside `finalResult` — these top-level columns make the totals
		// queryable without parsing the JSON blob.
		const sumRemoved =
			finalResult.plans.removed +
			finalResult.stations.removed +
			finalResult.accessPoints.removed +
			finalResult.nas.removed +
			finalResult.routers.removed +
			finalResult.dealers.removed +
			finalResult.employees.removed +
			finalResult.customers.removed;
		const sumRestored =
			finalResult.plans.restored +
			finalResult.stations.restored +
			finalResult.accessPoints.restored +
			finalResult.nas.restored +
			finalResult.routers.restored +
			finalResult.dealers.restored +
			finalResult.employees.restored +
			finalResult.customers.restored;

		// Mark completed
		await updateProgress(operationId, {
			status: "completed",
			completedAt: new Date(),
			result: finalResult,
			removedRecords: sumRemoved,
			restoredRecords: sumRestored,
		});

		logger.info(`[iRadius Sync] Operation ${operationId} completed`, {
			operationId,
			...finalResult,
			removedRecords: sumRemoved,
			restoredRecords: sumRestored,
			errorCount: finalResult.errors.length,
		});

		return { success: true, operationId };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown error";

		logger.error(`[iRadius Sync] Operation ${operationId} failed`, {
			operationId,
			error: message,
		});

		await updateProgress(operationId, {
			status: "failed",
			completedAt: new Date(),
			result: { error: message },
		}).catch(() => {});

		throw error;
	}
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createIRadiusSyncWorker(): Worker<
	IRadiusSyncJobData,
	IRadiusSyncJobResult
> {
	return new Worker<IRadiusSyncJobData, IRadiusSyncJobResult>(
		IRADIUS_SYNC_QUEUE_NAME,
		async (job) => processIRadiusSync(job),
		{
			connection: getRedisConnection(),
			concurrency: 1,
		},
	);
}
