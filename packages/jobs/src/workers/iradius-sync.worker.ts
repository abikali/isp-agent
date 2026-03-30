import {
	type ConnectionType,
	type CustomerStatus,
	db,
	type EmployeeDepartment,
} from "@repo/database";
import { queryIRadius, withIRadiusConnection } from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { IRADIUS_SYNC_QUEUE_NAME } from "../queues/iradius-sync.queue";
import type { IRadiusSyncJobData, IRadiusSyncJobResult } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStatus(
	archived?: unknown,
	active?: unknown,
	blocked?: unknown,
): CustomerStatus {
	if (toBooleanFromBit(archived)) {
		return "INACTIVE";
	}
	if (toBooleanFromBit(blocked)) {
		return "SUSPENDED";
	}
	if (toBooleanFromBit(active)) {
		return "ACTIVE";
	}
	return "PENDING";
}

function inferConnectionType(planName?: string | null): ConnectionType | null {
	if (!planName) {
		return "WIRELESS";
	}
	const lower = planName.toLowerCase();
	if (lower.includes("fiber") || lower.includes("ftth")) {
		return "FIBER";
	}
	if (lower.includes("dsl") || lower.includes("adsl")) {
		return "DSL";
	}
	return "WIRELESS";
}

function safeDate(val: unknown): Date | null {
	if (!val) {
		return null;
	}
	if (val instanceof Date) {
		return Number.isNaN(val.getTime()) ? null : val;
	}
	const d = new Date(val as string);
	return Number.isNaN(d.getTime()) ? null : d;
}

function toBigInt(val: unknown): bigint {
	if (val == null) {
		return BigInt(0);
	}
	try {
		return BigInt(Math.floor(Number(val)));
	} catch {
		return BigInt(0);
	}
}

function kbpsToMbps(kbps: unknown): number {
	const n = Number(kbps);
	if (!n || n <= 0) {
		return 0;
	}
	return Math.round(n / 1000);
}

/**
 * Pre-fetch the current max sequential number for the org, then return
 * a synchronous function that increments a counter in memory.
 * Avoids N+1 queries (one per record).
 */
async function createNumberGenerator(config: {
	organizationId: string;
	prefix: string;
	findLast: (orgId: string) => Promise<string | null>;
}): Promise<() => string> {
	const lastValue = await config.findLast(config.organizationId);
	let nextNumber = 1;
	if (lastValue) {
		const match = lastValue.match(new RegExp(`${config.prefix}-(\\d+)`));
		if (match?.[1]) {
			nextNumber = Number.parseInt(match[1], 10) + 1;
		}
	}
	return () => {
		const num = nextNumber;
		nextNumber++;
		return `${config.prefix}-${String(num).padStart(5, "0")}`;
	};
}

async function createAccountNumberGenerator(
	organizationId: string,
): Promise<() => string> {
	return createNumberGenerator({
		organizationId,
		prefix: "ACC",
		findLast: async (orgId) => {
			const last = await db.customer.findFirst({
				where: { organizationId: orgId },
				orderBy: { accountNumber: "desc" },
				select: { accountNumber: true },
			});
			return last?.accountNumber ?? null;
		},
	});
}

async function createEmployeeNumberGenerator(
	organizationId: string,
): Promise<() => string> {
	return createNumberGenerator({
		organizationId,
		prefix: "EMP",
		findLast: async (orgId) => {
			const last = await db.employee.findFirst({
				where: { organizationId: orgId },
				orderBy: { employeeNumber: "desc" },
				select: { employeeNumber: true },
			});
			return last?.employeeNumber ?? null;
		},
	});
}

const PROFILE_DEPARTMENT_MAP: Record<number, EmployeeDepartment> = {
	1: "MANAGEMENT",
	3: "MANAGEMENT",
	6: "BILLING",
	7: "CUSTOMER_SERVICE",
	8: "MANAGEMENT",
};

const PROFILE_POSITION_MAP: Record<number, string> = {
	1: "Administrator",
	3: "Viewer",
	6: "Collector",
	7: "Help Desk",
	8: "Read Only",
};

/** Map iRadius ProfileId to ISP role for auto-membership */
const PROFILE_ROLE_MAP: Record<number, string> = {
	1: "manager", // Administrator
	3: "manager", // Viewer
	6: "collector", // Collector
	7: "field_tech", // Help Desk
	8: "manager", // Read Only
};

/** ISP role permissions (mirrors ISP_ROLE_TEMPLATES from @repo/auth) */
const ISP_ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
	collector: {
		customers: ["read"],
		billing: ["view", "collect:own"],
		tasks: ["read"],
	},
	field_tech: {
		customers: ["read"],
		tasks: ["create", "read", "update"],
		inventory: ["read", "update"],
		installations: ["create", "read", "update"],
		stations: ["read"],
	},
	dealer: {
		customers: ["read"],
		servicePlans: ["read"],
		billing: ["view"],
	},
	manager: {
		customers: ["create", "read", "update", "delete", "import", "export"],
		employees: ["read", "update"],
		servicePlans: ["read", "update"],
		stations: ["read", "update"],
		tasks: ["create", "read", "update", "delete", "assign"],
		billing: ["view", "manage", "collect"],
		inventory: ["create", "read", "update", "delete"],
		installations: ["create", "read", "update", "approve"],
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
			update: {},
			create: {
				organizationId,
				role: roleKey,
				permission: JSON.stringify(permissions),
			},
		});
	}

	// Create Member if not exists
	const existingMember = await db.member.findUnique({
		where: {
			organizationId_userId: { organizationId, userId: targetUser.id },
		},
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

	// Link Employee → User
	await db.employee.update({
		where: { id: employeeId },
		data: { userId: targetUser.id },
	});
}

function toBooleanFromBit(val: unknown): boolean {
	if (Buffer.isBuffer(val)) {
		return val[0] === 1;
	}
	return Boolean(val);
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
			const result = {
				plans: { created: 0, updated: 0, errors: 0 },
				stations: { created: 0, updated: 0, errors: 0 },
				accessPoints: { created: 0, updated: 0, errors: 0 },
				nas: { created: 0, updated: 0, errors: 0 },
				routers: { created: 0, updated: 0, errors: 0 },
				dealers: { created: 0, updated: 0, errors: 0 },
				dealerAccounts: { created: 0, skipped: 0, errors: 0 },
				employees: { created: 0, updated: 0, errors: 0 },
				customers: { created: 0, updated: 0, errors: 0 },
				transactions: { created: 0, skipped: 0, errors: 0 },
				invoices: { created: 0, skipped: 0, errors: 0 },
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

				const existingPlans = await db.servicePlan.findMany({
					where: { organizationId },
					select: { id: true, name: true, externalId: true },
				});
				const planByExtId = new Map(
					existingPlans
						.filter((p) => p.externalId)
						.map((p) => [p.externalId, p.id]),
				);
				const planByName = new Map(
					existingPlans.map((p) => [p.name.toLowerCase(), p.id]),
				);

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
						await db.servicePlan
							.update({ where: { id: existing }, data: planData })
							.catch(() => {});
						result.plans.updated++;
					} else {
						try {
							const plan = await db.servicePlan.create({
								data: {
									organizationId,
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
					select: { id: true, name: true, externalId: true },
				});
				const stationByExtId = new Map(
					existingStations
						.filter((s) => s.externalId)
						.map((s) => [s.externalId, s.id]),
				);
				const stationByName = new Map(
					existingStations.map((s) => [s.name.toLowerCase(), s.id]),
				);

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
						await db.station
							.update({
								where: { id: existing },
								data: stationData,
							})
							.catch(() => {});
						result.stations.updated++;
					} else {
						try {
							const station = await db.station.create({
								data: {
									organizationId,
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
					select: { id: true, externalId: true },
				});
				const apByExtId = new Map(
					existingAPs
						.filter((a) => a.externalId)
						.map((a) => [a.externalId, a.id]),
				);

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
						await db.accessPoint
							.update({ where: { id: existing }, data: apData })
							.catch(() => {});
						result.accessPoints.updated++;
					} else {
						try {
							const created = await db.accessPoint.create({
								data: {
									organizationId,
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
					select: { id: true, externalId: true, host: true },
				});
				const nasByExtId = new Map(
					existingNas
						.filter((n) => n.externalId)
						.map((n) => [n.externalId, n.id]),
				);
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
						await db.ispNas
							.update({ where: { id: existing }, data: nasData })
							.catch(() => {});
						if (nasData.host) {
							nasHostMap.set(nasData.host, existing);
						}
						result.nas.updated++;
					} else {
						try {
							const created = await db.ispNas.create({
								data: {
									organizationId,
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
					select: { id: true, externalId: true },
				});
				const routerByExtId = new Map(
					existingRouters
						.filter((r) => r.externalId)
						.map((r) => [r.externalId, r.id]),
				);

				for (let i = 0; i < routers.length; i++) {
					const rt = routers[i];
					if (!rt) {
						continue;
					}
					const name = (rt["Name"] as string) || `Router-${rt["Id"]}`;
					const extId = String(rt["Id"]);
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
						await db.ispRouter
							.update({
								where: { id: existing },
								data: routerData,
							})
							.catch(() => {});
						result.routers.updated++;
					} else {
						try {
							await db.ispRouter.create({
								data: {
									organizationId,
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
					select: { id: true, externalId: true },
				});
				const dealerByExtId = new Map(
					existingDealers
						.filter((d) => d.externalId)
						.map((d) => [d.externalId, d.id]),
				);

				// Pass 1: Create/update all dealers without parent resolution
				for (let i = 0; i < dealerRows.length; i++) {
					const dr = dealerRows[i];
					if (!dr) {
						continue;
					}
					const dealerUserId = dr["Id"] as number;
					const extId = String(dealerUserId);
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
							await db.ispDealer.update({
								where: { id: existing },
								data: dealerData,
							});
							result.dealers.updated++;
						} else {
							const created = await db.ispDealer.create({
								data: dealerData,
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

			const batchSize = 500;

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
				select: { id: true, externalId: true },
			});
			const employeeByExtId = new Map(
				existingEmployees.map((e) => [e.externalId, e.id]),
			);

			const nextEmployeeNumber =
				await createEmployeeNumberGenerator(organizationId);

			for (let i = 0; i < employeeRows.length; i++) {
				const emp = employeeRows[i];
				if (!emp) {
					continue;
				}
				const empUserId = emp["Id"] as number;
				const extId = String(empUserId);
				const existingId = employeeByExtId.get(extId);
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
						await db.employee.update({
							where: { id: existingId },
							data: employeeData,
						});
						empRecordId = existingId;
						result.employees.updated++;
					} else {
						const employeeNumber = nextEmployeeNumber();
						const created = await db.employee.create({
							data: {
								organizationId,
								employeeNumber,
								preferredLayout: "collector",
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

			// ================================================================
			// Phase 8: Customers (only ProfileId = 4)
			// ================================================================
			await updateProgress(operationId, { phase: "customers" });

			const users = await queryIRadius(
				conn,
				`SELECT u.Id AS Id, u.UserName, u.FirstName, u.LastName, u.Mobile, u.Phone,
					u.MailAddress, u.Address, u.Comment, u.AccountPrice, u.Discount,
					u.Archived, u.CreationDate, u.CollectorId, u.ParentId,
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

			// Load existing customers for upsert
			const existingCustomers = await db.customer.findMany({
				where: {
					organizationId,
					externalId: { not: null },
				},
				select: { id: true, externalId: true },
			});
			const customerByExtId = new Map(
				existingCustomers.map((c) => [c.externalId, c.id]),
			);

			const nextAccountNumber =
				await createAccountNumberGenerator(organizationId);

			// Process real users
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
				const existingId = customerByExtId.get(extId);

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
					fullName:
						[u["FirstName"], u["LastName"]]
							.filter(Boolean)
							.join(" ")
							.trim() || "Unknown",
					firstName: (u["FirstName"] as string) || null,
					lastName: (u["LastName"] as string) || null,
					email: (u["MailAddress"] as string) || null,
					mobile: (u["Mobile"] as string) || null,
					phone: (u["Phone"] as string) || null,
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
					if (existingId) {
						await db.customer.update({
							where: { id: existingId },
							data: customerData,
						});
						result.customers.updated++;
					} else {
						const accountNumber = nextAccountNumber();
						const created = await db.customer.create({
							data: {
								organizationId,
								accountNumber,
								...customerData,
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

			// Process orphaned users (create minimal records for financial data)
			for (const orphan of orphanIds) {
				const userId = orphan["Id"] as number;
				const extId = String(userId);
				if (customerByExtId.has(extId)) {
					continue;
				}

				try {
					const accountNumber = nextAccountNumber();
					const created = await db.customer.create({
						data: {
							organizationId,
							accountNumber,
							fullName: `Deleted User #${userId}`,
							firstName: "Deleted",
							lastName: `User #${userId}`,
							externalId: extId,
							status: "INACTIVE",
							notes: "Deleted user — financial records only",
						},
					});
					customerByExtId.set(extId, created.id);
					result.customers.created++;
				} catch {
					result.customers.errors++;
				}
			}

			await updateProgress(operationId, {
				processedCustomers: users.length + orphanIds.length,
			});

			// ================================================================
			// Phase 9: Transactions
			// ================================================================
			await updateProgress(operationId, { phase: "transactions" });

			const balances = await queryIRadius(
				conn,
				`SELECT Id, UserId, InvoiceId, CollectorId, Credit, Debit, OperationDate, Notes
				FROM UserBalance ORDER BY UserId, OperationDate`,
			);

			await updateProgress(operationId, {
				totalTransactions: balances.length,
			});

			let processedTransactions = 0;

			for (let i = 0; i < balances.length; i += batchSize) {
				const batch = balances.slice(i, i + batchSize);
				const createData = [];

				for (const b of batch) {
					const customerId = customerByExtId.get(String(b["UserId"]));
					if (!customerId) {
						result.transactions.skipped++;
						continue;
					}

					const operationDate = safeDate(b["OperationDate"]);
					if (!operationDate) {
						result.transactions.skipped++;
						continue;
					}

					const txCollectorId = b["CollectorId"]
						? (employeeMap.get(b["CollectorId"] as number) ?? null)
						: null;

					createData.push({
						organizationId,
						customerId,
						externalId: String(b["Id"]),
						invoiceExternalId: b["InvoiceId"]
							? String(b["InvoiceId"])
							: null,
						collectorExternalId: b["CollectorId"]
							? String(b["CollectorId"])
							: null,
						collectorId: txCollectorId,
						credit: (b["Credit"] as number) ?? 0,
						debit: (b["Debit"] as number) ?? 0,
						notes: (b["Notes"] as string) ?? null,
						operationDate,
					});
				}

				if (createData.length > 0) {
					try {
						const created = await db.customerTransaction.createMany(
							{
								data: createData,
								skipDuplicates: true,
							},
						);
						result.transactions.created += created.count;
					} catch (error) {
						result.transactions.errors++;
						if (result.errors.length < 50) {
							result.errors.push({
								phase: "transactions",
								detail: `Batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : "Unknown"}`,
							});
						}
					}
				}

				processedTransactions += batch.length;
				if (
					processedTransactions % 100 === 0 ||
					i + batchSize >= balances.length
				) {
					await updateProgress(operationId, {
						processedTransactions,
					});
				}
			}

			await updateProgress(operationId, {
				processedTransactions: balances.length,
			});

			// ================================================================
			// Phase 10: Invoices
			// ================================================================
			await updateProgress(operationId, { phase: "invoices" });

			const invoices = await queryIRadius(
				conn,
				`SELECT Id, UserId, InvoiceNbr, Year, Month, InvoiceDate, ExpiryDate,
					Total, Discount, TVA, TTC, Paid, AutoGenerated,
					GeneratedDate, Blocked, VatValue
				FROM Invoice ORDER BY UserId, InvoiceDate`,
			);

			await updateProgress(operationId, {
				totalInvoices: invoices.length,
			});

			let processedInvoices = 0;

			for (let i = 0; i < invoices.length; i += batchSize) {
				const batch = invoices.slice(i, i + batchSize);
				const createData = [];

				for (const inv of batch) {
					const customerId = customerByExtId.get(
						String(inv["UserId"]),
					);
					if (!customerId) {
						result.invoices.skipped++;
						continue;
					}

					const invoiceDate = safeDate(inv["InvoiceDate"]);
					if (!invoiceDate) {
						result.invoices.skipped++;
						continue;
					}

					createData.push({
						organizationId,
						customerId,
						externalId: String(inv["Id"]),
						invoiceNumber: (inv["InvoiceNbr"] as string) ?? null,
						year:
							(inv["Year"] as number) ??
							invoiceDate.getFullYear(),
						month:
							(inv["Month"] as number) ??
							invoiceDate.getMonth() + 1,
						invoiceDate,
						expiryDate: safeDate(inv["ExpiryDate"]),
						total: (inv["Total"] as number) ?? 0,
						discount: (inv["Discount"] as number) ?? 0,
						tax: (inv["TVA"] as number) ?? 0,
						totalWithTax: (inv["TTC"] as number) ?? 0,
						paid: toBooleanFromBit(inv["Paid"]),
						autoGenerated: toBooleanFromBit(inv["AutoGenerated"]),
						generatedDate: safeDate(inv["GeneratedDate"]),
						blocked: toBooleanFromBit(inv["Blocked"]),
						vatValue: (inv["VatValue"] as number) ?? null,
					});
				}

				if (createData.length > 0) {
					try {
						const created = await db.customerInvoice.createMany({
							data: createData,
							skipDuplicates: true,
						});
						result.invoices.created += created.count;
					} catch (error) {
						result.invoices.errors++;
						if (result.errors.length < 50) {
							result.errors.push({
								phase: "invoices",
								detail: `Batch ${Math.floor(i / batchSize) + 1}: ${error instanceof Error ? error.message : "Unknown"}`,
							});
						}
					}
				}

				processedInvoices += batch.length;
				if (
					processedInvoices % 100 === 0 ||
					i + batchSize >= invoices.length
				) {
					await updateProgress(operationId, {
						processedInvoices,
					});
				}
			}

			await updateProgress(operationId, {
				processedInvoices: invoices.length,
			});

			return result;
		});

		// Mark completed
		await updateProgress(operationId, {
			status: "completed",
			completedAt: new Date(),
			result: finalResult,
		});

		logger.info(`[iRadius Sync] Operation ${operationId} completed`, {
			operationId,
			...finalResult,
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
