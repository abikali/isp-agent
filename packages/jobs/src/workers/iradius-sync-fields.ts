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
	// iRadius-owned subscription/network infrastructure.
	// `expiresAt` has an admin override (customers.setExpiryDate) routed
	// through mirrorToIRadius — the override writes iRadius first, so any
	// sync that runs afterwards sees the same value we just stored. Payments
	// on iRadius bump ExpiryAccount later; silent overwrite is the desired
	// behaviour there (the admin override is a one-off, not a freeze).
	"expiresAt",
	"ipAddress",
	"macAddress",
	"nasId",
	"nasHost",
	"mikrotikQueue",
	"mikrotikInterface",
	"routerBrandPrefix",
]);

/**
 * Synthetic conflict-field key for the "customer deleted on iRadius but still
 * present locally" case. It is NOT a real Customer column — it lives only inside
 * `SyncConflict.fields` so the existing per-field conflict pipeline (list,
 * resolve, bulk-resolve, UI) can carry it. Resolution semantics:
 *   - keep_local  → keep the customer as-is (admin asserts it's still real)
 *   - keep_remote → soft-delete the customer (iRadius is right, it's gone)
 * The leading double underscore keeps it from ever colliding with a camelCase
 * Customer field name.
 */
export const IRADIUS_DELETED_FIELD = "__iradiusDeleted";

/**
 * Notes marker stamped on the minimal stub records the sync creates for iRadius
 * users that exist only as financial back-references (deleted from `User` but
 * still in `UserBalance`/`Invoice`). Shared so the orphan loop can recognise its
 * own stubs and avoid raising a deletion conflict for them.
 */
export const ORPHAN_STUB_NOTES = "Deleted user — financial records only";

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
