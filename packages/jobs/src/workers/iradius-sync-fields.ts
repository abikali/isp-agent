/**
 * Field classification for iRadius sync conflict detection.
 *
 * Fields are split into four categories:
 * 1. LOCAL_AUTHORITATIVE — local is source of truth; sync never touches these after create
 * 2. CONFLICT_TRACKED — admin-meaningful data that requires manual resolution when changed
 * 3. AUTO_UPDATE — iRadius is source of truth; always overwrites silently
 * 4. Everything else — iRadius-owned config that auto-updates silently
 */

// ---------------------------------------------------------------------------
// Field classification
// ---------------------------------------------------------------------------

/**
 * Fields where local is the source of truth. The sync never overwrites these
 * (or generates conflicts for them) after the initial customer create. iRadius
 * may hold stale, imprecise, or empty values for these — ignore what iRadius
 * returns.
 */
export const LOCAL_AUTHORITATIVE_FIELDS = new Set([
	// Personal info — collectors and agents verify and enrich these in our app
	// (name corrections, verified phones, corrected addresses, better emails).
	// iRadius's copy is often outdated/incomplete; local is the source of truth.
	"fullName",
	"firstName",
	"lastName",
	"email",
	"mobile",
	"phone",
	"phones",
	"address",
	"username",
	// Geo — our location-request flow owns this; iRadius GSMLat/GSMLng is
	// often stale/null and returns different float precision, generating
	// false-positive conflicts.
	"latitude",
	"longitude",
	// Local admin annotations — distinct in purpose from iRadius User.Comment.
	"notes",
]);

/** Fields that generate conflicts when iRadius differs from local. */
export const CONFLICT_TRACKED_FIELDS = new Set([
	// Relationships (FK IDs)
	"planId",
	"stationId",
	"accessPointId",
	"dealerId",
	"collectorId",
	// Status & classification
	"status",
	"connectionType",
	"categoryName",
	"groupName",
	"groupExternalId",
	"collectorName",
	"collectorPhone",
	"mof",
	// Network (only fields admins can actually reassign locally)
	"staticIp",
	"mikrotikUser",
	"mikrotikInterface1",
	"wirelessInterface",
	// Pricing
	"monthlyRate",
	"discount",
	"iptvPrice",
	"realIpPrice",
	// Dates (original/activated — set once, rarely change)
	"originalCreatedAt",
	"activatedAt",
	// Flags
	"automaticRenew",
]);

/**
 * Fields where iRadius is the source of truth and silent overwrite is desired.
 * Includes volatile telemetry plus iRadius-owned infrastructure that admins
 * never edit locally (and that have no local write path in `updateCustomer`).
 */
export const AUTO_UPDATE_FIELDS = new Set([
	// Volatile telemetry
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
	// iRadius-owned subscription/network infrastructure
	// (no local edit UI; iRadius is authoritative — silent overwrite is fine)
	"expiresAt",
	"ipAddress",
	"macAddress",
	"nasId",
	"nasHost",
	"mikrotikQueue",
	"mikrotikInterface",
	"routerBrandPrefix",
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

	// Floats: epsilon compare to avoid false positives from Postgres/JS/iRadius
	// double-precision rendering differences (e.g. 33.8841255 vs 33.884125499999996).
	if (typeof local === "number" && typeof remote === "number") {
		return Math.abs(local - remote) < 1e-6;
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
