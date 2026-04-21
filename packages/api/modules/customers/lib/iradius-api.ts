import { type IspApiConfig, ispPost } from "@repo/ai/isp-api-client";
import { executeIRadius, withIRadiusConnection } from "@repo/database/iradius";

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
 * No-op (resolves) when the customer is not linked to iRadius —
 * unlinked customers have no remote state to keep in sync.
 */
export async function iradiusSetActive(
	customer: { externalId?: string | null; username?: string | null },
	active: boolean,
): Promise<void> {
	// Unlinked customer — nothing to sync.
	if (!customer.externalId && !customer.username) {
		return;
	}

	const config = getIspApiConfigFromEnv();
	if (!config) {
		throw new Error("ISP API not configured");
	}

	const body: Record<string, unknown> = { active };
	if (customer.externalId) {
		body["userId"] = Number.parseInt(customer.externalId, 10);
	} else {
		body["username"] = customer.username;
	}

	const result = await ispPost<{ success?: boolean; error?: string }>(
		config,
		"/activate-user",
		body,
	);
	if (result && result.success === false) {
		throw new Error(result.error ?? "iRadius activate-user failed");
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
 * Update a customer's mobile / phone in iRadius. Pass `null` to clear.
 */
export async function iradiusUpdateUserPhones(
	customer: { externalId?: string | null },
	mobile: string | null,
	phone: string | null,
): Promise<{ affectedRows: number }> {
	const userId = requireExternalId(customer);
	return withIRadiusConnection(async (conn) => {
		return executeIRadius(
			conn,
			"UPDATE User SET Mobile = ?, Phone = ?, UpdateDate = NOW() WHERE Id = ?",
			[mobile, phone, userId],
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
	return result;
}
