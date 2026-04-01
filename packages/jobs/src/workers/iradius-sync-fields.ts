/**
 * Field classification for iRadius sync conflict detection.
 *
 * Fields are split into three categories:
 * 1. CONFLICT_TRACKED — admin-meaningful data that requires manual resolution when changed
 * 2. AUTO_UPDATE — volatile telemetry that always overwrites silently
 * 3. Everything else — iRadius-owned config that auto-updates silently
 */

// ---------------------------------------------------------------------------
// Field classification
// ---------------------------------------------------------------------------

/** Fields that generate conflicts when iRadius differs from local. */
export const CONFLICT_TRACKED_FIELDS = new Set([
	// Personal info
	"fullName",
	"firstName",
	"lastName",
	"email",
	"mobile",
	"phone",
	"phones",
	"address",
	"username",
	"notes",
	// Relationships (FK IDs)
	"planId",
	"stationId",
	"accessPointId",
	"dealerId",
	"collectorId",
	"nasId",
	// Status & classification
	"status",
	"connectionType",
	"categoryName",
	"groupName",
	"collectorName",
	"collectorPhone",
	"mof",
	// Network
	"ipAddress",
	"macAddress",
	"staticIp",
	"nasHost",
	"mikrotikUser",
	"mikrotikInterface",
	"mikrotikInterface1",
	"mikrotikQueue",
	"wirelessInterface",
	"routerBrandPrefix",
	// Pricing
	"monthlyRate",
	"discount",
	"iptvPrice",
	"realIpPrice",
	// Dates
	"originalCreatedAt",
	"activatedAt",
	"expiresAt",
	// Geo
	"latitude",
	"longitude",
	// Flags
	"automaticRenew",
]);

/** Volatile telemetry fields — always overwrite silently. */
export const AUTO_UPDATE_FIELDS = new Set([
	"online",
	"downloadBytes",
	"uploadBytes",
	"dailyDownloadBytes",
	"dailyUploadBytes",
	"freeDownloadBytes",
	"freeUploadBytes",
	"lastLogin",
	"lastLogOut",
	"nasLastLogOut",
	"fupMode",
	"excludeDailyDownloadBytes",
	"excludeDailyUploadBytes",
	"excludeMonthlyDownloadBytes",
	"excludeMonthlyUploadBytes",
	"freeDailyDownloadBytes",
	"freeDailyUploadBytes",
	"excludeFreeDailyDownloadBytes",
	"excludeFreeMonthlyDownloadBytes",
	"excludeFreeDailyUploadBytes",
	"excludeFreeMonthlyUploadBytes",
]);

export function isConflictTrackedField(key: string): boolean {
	return CONFLICT_TRACKED_FIELDS.has(key);
}

export function isAutoUpdateField(key: string): boolean {
	return AUTO_UPDATE_FIELDS.has(key);
}

// ---------------------------------------------------------------------------
// Value comparison
// ---------------------------------------------------------------------------

/** Compare two values for equality, handling null, BigInt, Date, and JSON. */
export function valuesEqual(local: unknown, remote: unknown): boolean {
	// Both nullish
	if (local == null && remote == null) {
		return true;
	}
	if (local == null || remote == null) {
		return false;
	}

	// BigInt
	if (typeof local === "bigint" || typeof remote === "bigint") {
		try {
			return BigInt(local as bigint) === BigInt(remote as bigint);
		} catch {
			return false;
		}
	}

	// Date
	if (local instanceof Date && remote instanceof Date) {
		return local.getTime() === remote.getTime();
	}
	if (local instanceof Date || remote instanceof Date) {
		try {
			const ld =
				local instanceof Date ? local : new Date(local as string);
			const rd =
				remote instanceof Date ? remote : new Date(remote as string);
			return ld.getTime() === rd.getTime();
		} catch {
			return false;
		}
	}

	// JSON arrays/objects (e.g. phones)
	if (typeof local === "object" || typeof remote === "object") {
		return JSON.stringify(local) === JSON.stringify(remote);
	}

	// Primitives
	return String(local) === String(remote);
}

// ---------------------------------------------------------------------------
// Serialization (for storing in SyncConflict.fields JSON)
// ---------------------------------------------------------------------------

/** Serialize a value to a JSON-safe string for conflict storage. */
export function serializeValue(val: unknown): string | null {
	if (val == null) {
		return null;
	}
	if (val instanceof Date) {
		return val.toISOString();
	}
	if (typeof val === "bigint") {
		return val.toString();
	}
	return JSON.stringify(val);
}

/** BigInt fields on the Customer model. */
const BIGINT_FIELDS = new Set([
	"downloadBytes",
	"uploadBytes",
	"dailyDownloadBytes",
	"dailyUploadBytes",
	"freeDownloadBytes",
	"freeUploadBytes",
	"excludeDailyDownloadBytes",
	"excludeDailyUploadBytes",
	"excludeMonthlyDownloadBytes",
	"excludeMonthlyUploadBytes",
	"freeDailyDownloadBytes",
	"freeDailyUploadBytes",
	"excludeFreeDailyDownloadBytes",
	"excludeFreeMonthlyDownloadBytes",
	"excludeFreeDailyUploadBytes",
	"excludeFreeMonthlyUploadBytes",
]);

/** Date fields on the Customer model. */
const DATE_FIELDS = new Set([
	"originalCreatedAt",
	"activatedAt",
	"expiresAt",
	"lastLogin",
	"lastLogOut",
	"nasLastLogOut",
	"tempExpiryAccount",
	"overrideExpiryAccount",
]);

/** Float fields on the Customer model. */
const FLOAT_FIELDS = new Set([
	"monthlyRate",
	"discount",
	"iptvPrice",
	"realIpPrice",
	"latitude",
	"longitude",
	"deductMoney",
	"extraUploadGb",
	"extraDownloadGb",
]);

/** Integer fields on the Customer model. */
const INT_FIELDS = new Set([
	"financialCategoryId",
	"linkId",
	"nasAccountId",
	"extraDaysToAddOnRefill",
	"extraDaysToDeductOnRefill",
	"addedHours",
	"oldAccountTypeId",
	"forwardAccountTypeId",
	"conditionAccountTypeId",
	"forceExpiryAfterDays",
]);

/** Deserialize a stored string value back to its proper type for Prisma update. */
export function deserializeValue(
	serialized: string | null,
	fieldName: string,
): unknown {
	if (serialized == null) {
		return null;
	}

	if (BIGINT_FIELDS.has(fieldName)) {
		return BigInt(serialized);
	}

	if (DATE_FIELDS.has(fieldName)) {
		return new Date(serialized);
	}

	if (FLOAT_FIELDS.has(fieldName)) {
		return Number.parseFloat(serialized);
	}

	if (INT_FIELDS.has(fieldName)) {
		return Number.parseInt(serialized, 10);
	}

	// JSON-encoded strings, booleans, arrays, objects
	try {
		return JSON.parse(serialized);
	} catch {
		return serialized;
	}
}

// ---------------------------------------------------------------------------
// Shared types (used by API + worker)
// ---------------------------------------------------------------------------

export interface ConflictField {
	local: string | null;
	remote: string | null;
	resolution: "keep_local" | "keep_remote" | null;
}

export type ConflictFields = Record<string, ConflictField>;
