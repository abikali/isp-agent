import { type IspApiConfig, ispPost } from "@repo/ai/isp-api-client";
import {
	executeIRadius,
	queryIRadius,
	withIRadiusConnection,
} from "@repo/database/iradius";
import { logger } from "@repo/logs";
import { iradiusForceDisconnect } from "./iradius-disconnect";

/**
 * Read-only check: is `username` already taken on iRadius (User.UserName)?
 *
 * Matches case-insensitively via MySQL's default collation on `=`, which is
 * the stricter (safer) choice for an existence check. Used before assigning a
 * username to a locally-approved customer so an admin can never pick one that
 * already exists on the legacy system. This is a SELECT only — it never
 * mutates iRadius, so it sits outside the narrow sanctioned-write carve-out.
 */
export async function iradiusUsernameExists(
	username: string,
): Promise<boolean> {
	const trimmed = username.trim();
	if (!trimmed) {
		return false;
	}
	return withIRadiusConnection(async (conn) => {
		const rows = await queryIRadius(
			conn,
			"SELECT Id FROM User WHERE UserName = ? LIMIT 1",
			[trimmed],
		);
		return rows.length > 0;
	});
}

/**
 * Thrown by `iradiusSetActive` when iRadius reports the user no longer
 * exists — typically because an admin deleted it directly in iRadius.
 * Callers catch this to offer a local-only fallback instead of failing
 * outright (a missing remote user can't drift from a local INACTIVE state).
 */
export class IRadiusUserNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IRadiusUserNotFoundError";
	}
}

export interface AccountTypeChangePreview {
	success: boolean;
	preview: boolean;
	userId: number;
	username: string;
	oldAccountType: {
		id: number;
		name: string;
		rate: number;
		sellingPrice: number;
	};
	newAccountType: {
		id: number;
		name: string;
		rate: number;
		sellingPrice: number;
	};
	accountPrice: number;
	billing: {
		refund: number;
		dealerCreditBefore: number;
		dealerCreditAfter: number;
		quotaReset: boolean;
	};
}

export interface AccountTypeChangeResult {
	success: boolean;
	userId: number;
	username: string;
	oldAccountType: { id: number; name: string };
	newAccountType: { id: number; name: string };
	disconnected: boolean;
}

function getIspApiConfigFromEnv(): IspApiConfig | null {
	const baseUrl = process.env["ISP_API_BASE_URL"];
	const userName = process.env["ISP_API_USERNAME"];
	const password = process.env["ISP_API_PASSWORD"];

	if (!baseUrl || !userName || !password) {
		return null;
	}

	return {
		baseUrl: baseUrl.replace(/\/+$/, ""),
		userName,
		password,
	};
}

/**
 * Set a customer's active status in iRadius via the REST API.
 * Throws on any HTTP / configuration failure so callers (via
 * `mirrorToIRadius`) can abort the local write.
 *
 * No-op (resolves) when the customer has no `externalId` — unlinked
 * customers have no remote state to keep in sync. Falling back to
 * `username` here is unsafe: a locally-created customer or a customer
 * in an iRadius-disabled org may share a username with a real iRadius
 * user we don't intend to touch (defense in depth alongside the
 * org-level `iradiusDisabled` flag).
 *
 * When deactivating: iRadius's own MikroTik disconnect inside
 * `/activate-user` is broken end-to-end and the response can't be trusted.
 * Decompiling the running jar shows `UserActivationDao.disconnectFromMikrotik`
 * swallows every internal failure (radclient has a literal `+ userName +`
 * typo and uses port 1700; the MikroTik-API fallback uses `where name=X`
 * syntax instead of `?name=X`), and the service wraps that void call in a
 * try/catch — so `disconnected: true` comes back even when nothing was
 * kicked. We always invoke `iradiusForceDisconnect` ourselves via the
 * RouterOS API path on every deactivation. Best-effort: the DB write is
 * already correct either way.
 */
/**
 * Write the iRadius audit-trail row for an enable/disable, mirroring exactly
 * what the legacy GWT UI's `TraceUserLog` does when an operator toggles a
 * user's Active flag: `OperationTypeId = 8` (ENABLE_DISABLE_USER) and
 * `Description = "User Enable = true|false"`. iRadius's own `/activate-user`
 * REST endpoint (UserActivationDao) only flips `UserNas.Active` and does NOT
 * write this row, so without this the action is invisible in iRadius's user
 * history — the gap this fills.
 *
 * `UserId`, `DealerId` and `UserName` are read straight from the `User` row by
 * Id so the row matches the legacy format precisely (DealerId = the user's
 * owning dealer, `User.ParentId`) without depending on local data being in
 * sync. Best-effort: the remote Active flag is already flipped and the local
 * DB write is correct either way, so a failure here must never abort the
 * operation — it is logged and swallowed.
 */
async function iradiusLogEnableDisable(
	userId: number,
	active: boolean,
): Promise<void> {
	try {
		await withIRadiusConnection(async (conn) => {
			await executeIRadius(
				conn,
				`INSERT INTO UserLog (UserId, DealerId, UserName, OperationTypeId, Description, Logdate)
				 SELECT Id, ParentId, UserName, 8, ?, NOW() FROM User WHERE Id = ?`,
				[`User Enable = ${active ? "true" : "false"}`, userId],
			);
		});
	} catch (error) {
		logger.warn("iRadius enable/disable UserLog insert failed", {
			userId,
			active,
			error: error instanceof Error ? error.message : error,
		});
	}
}

export async function iradiusSetActive(
	customer: { externalId?: string | null },
	active: boolean,
	options?: { tolerateMissing?: boolean },
): Promise<void> {
	if (!customer.externalId) {
		return;
	}

	const config = getIspApiConfigFromEnv();
	if (!config) {
		throw new Error("ISP API not configured");
	}

	const body: Record<string, unknown> = {
		active,
		userId: Number.parseInt(customer.externalId, 10),
	};

	const result = await ispPost<{
		success?: boolean;
		error?: string;
	}>(config, "/activate-user", body);
	if (result && result.success === false) {
		// iRadius signals a deleted/unknown user with a "not found" message.
		// When the caller can tolerate that (deactivations/deletes — a missing
		// remote user can't drift from a local INACTIVE state) treat it as a
		// no-op success. Otherwise surface a typed error so the caller can
		// decide — the billing review flow prompts the operator to deactivate
		// locally anyway rather than dead-ending on a 500.
		if (/not found/i.test(result.error ?? "")) {
			if (options?.tolerateMissing) {
				return;
			}
			throw new IRadiusUserNotFoundError(
				result.error ?? "iRadius user not found",
			);
		}
		throw new Error(result.error ?? "iRadius activate-user failed");
	}

	// iRadius's /activate-user only flips UserNas.Active; it doesn't record the
	// audit-trail row the legacy UI writes. Add it ourselves so the toggle shows
	// up in iRadius's user history. Best-effort — never blocks the local write.
	await iradiusLogEnableDisable(
		Number.parseInt(customer.externalId, 10),
		active,
	);

	if (!active) {
		await iradiusForceDisconnect({ externalId: customer.externalId });
	}
}

export interface IradiusCreateUserInput {
	userName: string;
	password: string;
	accountTypeId: number; // ServicePlan.externalId
	parentId?: number | null; // IspDealer.externalId
	firstName?: string | null;
	lastName?: string | null;
	mobile?: string | null;
	mailAddress?: string | null;
	address?: string | null;
	comment?: string | null;
	collectorId?: number | null; // Employee.externalId
	userGroupId?: number | null; // Customer.groupExternalId
	accountPrice?: number;
	discount?: number;
	expiryAccount?: string | null; // "YYYY-MM-DD HH:MM:SS" (tz-naive UTC) or null
	iptvPrice?: number;
	realIpPrice?: number;
	gsmLat?: number | null;
	gsmLng?: number | null;
	stationId?: number | null; // Station.externalId
	accessPointId?: number | null;
}

/**
 * Create a brand-new subscriber (User ProfileId=4 + UserNas) in iRadius via the
 * `/create-user` endpoint we added to RadiusServerApp. Returns the new iRadius
 * User.Id, which the caller stores as `Customer.externalId` to link the two
 * sides. Throws on any HTTP / config / duplicate-username failure so callers
 * can abort before writing locally.
 */
export async function iradiusCreateUser(
	input: IradiusCreateUserInput,
): Promise<{ userId: number; username: string }> {
	const config = getIspApiConfigFromEnv();
	if (!config) {
		throw new Error("ISP API not configured");
	}
	const result = await ispPost<{
		success?: boolean;
		userId?: number;
		username?: string;
		error?: string;
	}>(config, "/create-user", input as unknown as Record<string, unknown>);
	if (!result || result.success === false || !result.userId) {
		throw new Error(result?.error ?? "iRadius create-user failed");
	}
	return {
		userId: result.userId,
		username: result.username ?? input.userName,
	};
}

/**
 * Apply iRadius's native "NEW USER" charge to a freshly-created subscriber:
 * decrements the dealer's credit, cascades dealer commission, and generates the
 * opening Invoice + UserBalance "Renew Account" debit — exactly what the legacy
 * GWT add-user does. Implemented by a thin servlet we added to the iRadius
 * Tomcat app (`/iradius/charge-new-user`) that calls iRadius's own
 * `RenewUser.renewUser(addMode=NEW USER)`, because that billing logic lives in
 * the GWT webapp and is NOT reachable from the `/create-user` REST app.
 *
 * The endpoint is idempotent (skips if the user already has a UserBalance row),
 * so retries can't double-charge. Requires `IRADIUS_CHARGE_URL` (full endpoint
 * URL, port 80) and `IRADIUS_CHARGE_SECRET`. Throws on any failure so the caller
 * can log it — the user already exists at this point, so callers should log and
 * continue rather than orphan the subscriber.
 */
export async function iradiusChargeNewUser(userId: number): Promise<void> {
	const url = process.env["IRADIUS_CHARGE_URL"];
	const secret = process.env["IRADIUS_CHARGE_SECRET"];
	if (!url || !secret) {
		throw new Error(
			"iRadius charge endpoint not configured (IRADIUS_CHARGE_URL / IRADIUS_CHARGE_SECRET)",
		);
	}
	const res = await fetch(`${url}?userId=${encodeURIComponent(userId)}`, {
		method: "POST",
		headers: { "X-Charge-Secret": secret },
	});
	const text = await res.text();
	let body: { success?: boolean; error?: string } = {};
	try {
		body = JSON.parse(text) as { success?: boolean; error?: string };
	} catch {
		// non-JSON response — fall through to the status check below
	}
	if (!res.ok || body.success === false) {
		throw new Error(
			body.error ?? `iRadius charge failed (HTTP ${res.status})`,
		);
	}
}

/**
 * Preview an account type change in iRadius (dry-run with billing info).
 * Returns null if ISP API is not configured or customer is not linked.
 */
export async function previewAccountTypeChange(
	customer: { externalId?: string | null; username?: string | null },
	accountTypeId: number,
): Promise<AccountTypeChangePreview> {
	const config = getIspApiConfigFromEnv();
	if (!config) {
		throw new Error("ISP API not configured");
	}
	if (!customer.externalId && !customer.username) {
		throw new Error("Customer has no externalId or username");
	}

	const body: Record<string, unknown> = {
		accountTypeId,
		preview: true,
	};
	if (customer.externalId) {
		body["userId"] = Number.parseInt(customer.externalId, 10);
	} else {
		body["username"] = customer.username;
	}

	const result = await ispPost<AccountTypeChangePreview>(
		config,
		"/change-account-type",
		body,
	);
	if (!result.success) {
		throw new Error(
			(result as unknown as { error?: string }).error ??
				"iRadius preview failed",
		);
	}
	return result;
}

// ---------------------------------------------------------------------------
// Direct-SQL admin actions (via SSH tunnel)
// ---------------------------------------------------------------------------
//
// These wrappers perform exactly the same single-row updates the legacy
// iRadius GWT admin UI does. They are audited end-to-end in
// `docs/iradius-actions-investigation.md`. Each function is intentionally
// narrow: it updates the single row(s) specified and returns affectedRows.
//
// Callers are responsible for:
//  - resolving the iRadius User.Id from our `customer.externalId`
//  - mirroring the new value on our local `Customer` row
//  - writing audit log entries on our side
// ---------------------------------------------------------------------------

function requireExternalId(customer: { externalId?: string | null }): number {
	if (!customer.externalId) {
		throw new Error("Customer has no externalId (not linked to iRadius)");
	}
	const parsed = Number.parseInt(customer.externalId, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`Invalid externalId: ${customer.externalId}`);
	}
	return parsed;
}

/**
 * Reset a customer's MAC address in iRadius (UserNas.MacAddress = NULL).
 * The MAC is re-learned on the next RADIUS Accounting-Start packet.
 * No MikroTik disconnect is forced — matches legacy UI behaviour.
 */
export async function iradiusResetMacAddress(customer: {
	externalId?: string | null;
}): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE UserNas SET MacAddress = NULL WHERE UserId = ?",
			[userId],
		);
	});
}

/**
 * Update a customer's first and last name in iRadius. Stamps UpdateDate
 * like the legacy UI does. ModifiedUserId is left null because this is
 * driven by our system, not a logged-in iRadius operator.
 */
export async function iradiusUpdateUserName(
	customer: { externalId?: string | null },
	firstName: string,
	lastName: string,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET FirstName = ?, LastName = ?, UpdateDate = NOW() WHERE Id = ?",
			[firstName, lastName, userId],
		);
	});
}

/**
 * Update a customer's Mobile column on iRadius. `User.Phone` is intentionally
 * left untouched — we store all local phones dash-joined into Mobile (primary
 * first) and no longer mirror the secondary number into Phone. Pass `null` to
 * clear Mobile.
 */
export async function iradiusUpdateUserPhones(
	customer: { externalId?: string | null },
	mobile: string | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET Mobile = ?, UpdateDate = NOW() WHERE Id = ?",
			[mobile, userId],
		);
	});
}

/**
 * Update a customer's email (User.MailAddress) in iRadius.
 * Pass `null` to clear.
 */
export async function iradiusUpdateUserEmail(
	customer: { externalId?: string | null },
	email: string | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET MailAddress = ?, UpdateDate = NOW() WHERE Id = ?",
			[email, userId],
		);
	});
}

/**
 * Update a customer's postal address (User.Address) in iRadius.
 * Pass `null` to clear.
 */
export async function iradiusUpdateUserAddress(
	customer: { externalId?: string | null },
	address: string | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET Address = ?, UpdateDate = NOW() WHERE Id = ?",
			[address, userId],
		);
	});
}

/**
 * Update a customer's GPS coordinates (UserNas.GSMLat / GSMLng) in iRadius.
 * Pass `null` for either to clear. Writes to UserNas keyed on UserId — one
 * row per user, so a simple UPDATE is sufficient.
 */
export async function iradiusUpdateUserLocation(
	customer: { externalId?: string | null },
	latitude: number | null,
	longitude: number | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE UserNas SET GSMLat = ?, GSMLng = ? WHERE UserId = ?",
			[latitude, longitude, userId],
		);
	});
}

/**
 * Update a customer's Comment (User.Comment) in iRadius from local `notes`.
 * Pass `null` to clear. Mirror only: the pull-side keeps `notes` local-
 * authoritative and does not overwrite.
 */
export async function iradiusUpdateUserComment(
	customer: { externalId?: string | null },
	comment: string | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET Comment = ?, UpdateDate = NOW() WHERE Id = ?",
			[comment, userId],
		);
	});
}

/**
 * Update a customer's UserGroup assignment (User.UserGroupId) in iRadius.
 * Pass `null` to clear. Caller must pass a valid id that exists in UserGroup —
 * we don't validate here, but iRadius has no FK constraint either; any invalid
 * id simply becomes an unresolvable JOIN target.
 */
export async function iradiusUpdateUserGroup(
	customer: { externalId?: string | null },
	userGroupId: number | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET UserGroupId = ?, UpdateDate = NOW() WHERE Id = ?",
			[userGroupId, userId],
		);
	});
}

/**
 * Set a customer's recurring discount in iRadius (User.Discount).
 * Per-invoice discounts are NOT supported — they require recomputing
 * Invoice.TTC/Tax/TVA and would need a separate function.
 */
export async function iradiusSetRecurringDiscount(
	customer: { externalId?: string | null },
	discount: number,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET Discount = ?, UpdateDate = NOW() WHERE Id = ?",
			[discount, userId],
		);
	});
}

/**
 * Set a customer's IPTV price in iRadius (UserNas.IPTVPRICE).
 * The billing engine adds this on top of the plan's SellingPrice. Pass 0
 * to clear.
 */
export async function iradiusSetIptvPrice(
	customer: { externalId?: string | null },
	iptvPrice: number,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE UserNas SET IPTVPRICE = ? WHERE UserId = ?",
			[iptvPrice, userId],
		);
	});
}

/**
 * Set a customer's real-IP price in iRadius (UserNas.REALIPPRICE). Added on
 * top of the plan's price on the next invoice, like IPTVPRICE. Column is a
 * nullable float; pass 0 to clear.
 */
export async function iradiusSetRealIpPrice(
	customer: { externalId?: string | null },
	realIpPrice: number,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE UserNas SET REALIPPRICE = ? WHERE UserId = ?",
			[realIpPrice, userId],
		);
	});
}

/**
 * Set a customer's deduct-money amount in iRadius (UserNas.DeductMoney).
 * Nullable float column; pass null to clear.
 */
export async function iradiusSetDeductMoney(
	customer: { externalId?: string | null },
	deductMoney: number | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE UserNas SET DeductMoney = ? WHERE UserId = ?",
			[deductMoney, userId],
		);
	});
}

/**
 * Set a customer's billing expiry in iRadius (UserNas.ExpiryAccount).
 * Caller passes a MySQL DATETIME literal ("YYYY-MM-DD HH:MM:SS") or null to
 * clear — the same literal is also written to local Postgres so both sides
 * hold the tz-naive, UTC-aligned value the sync pipeline assumes.
 */
export async function iradiusSetExpiryAccount(
	customer: { externalId?: string | null },
	mysqlDateTime: string | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE UserNas SET ExpiryAccount = ? WHERE UserId = ?",
			[mysqlDateTime, userId],
		);
	});
}

/**
 * Change a customer's collector in iRadius (User.CollectorId). Past
 * UserBalance.CollectorId rows are preserved (commission history intact).
 * Pass `null` to clear the assignment.
 */
export async function iradiusChangeCollector(
	customer: { externalId?: string | null },
	collectorIRadiusUserId: number | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET CollectorId = ?, UpdateDate = NOW() WHERE Id = ?",
			[collectorIRadiusUserId, userId],
		);
	});
}

/**
 * Execute an account type change in iRadius.
 * Updates the plan, adjusts dealer billing, disconnects from MikroTik.
 *
 * iRadius's own MikroTik disconnect inside this endpoint is buggy
 * (`/ppp/active/remove =.id=…` has an extra `=` prefix that RouterOS
 * rejects as "unknown parameter"). If the response indicates the live
 * session was NOT kicked, we follow up with `iradiusForceDisconnect` so
 * the new plan actually takes effect on the next reconnect rather than
 * waiting for the natural session expiry. Best-effort.
 */
export async function executeAccountTypeChange(
	customer: { externalId?: string | null; username?: string | null },
	accountTypeId: number,
): Promise<AccountTypeChangeResult> {
	const config = getIspApiConfigFromEnv();
	if (!config) {
		throw new Error("ISP API not configured");
	}
	if (!customer.externalId && !customer.username) {
		throw new Error("Customer has no externalId or username");
	}

	const body: Record<string, unknown> = { accountTypeId };
	if (customer.externalId) {
		body["userId"] = Number.parseInt(customer.externalId, 10);
	} else {
		body["username"] = customer.username;
	}

	const result = await ispPost<AccountTypeChangeResult>(
		config,
		"/change-account-type",
		body,
	);
	if (!result.success) {
		throw new Error(
			(result as unknown as { error?: string }).error ??
				"iRadius account type change failed",
		);
	}

	if (customer.externalId && result.disconnected !== true) {
		await iradiusForceDisconnect({ externalId: customer.externalId });
	}

	return result;
}
