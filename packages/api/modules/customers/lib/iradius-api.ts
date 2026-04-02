import { type IspApiConfig, ispPost } from "@repo/ai/isp-api-client";
import { logger } from "@repo/logs";

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
 * Sync customer active status to iRadius via the REST API.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function syncActiveStatusToIRadius(
	customer: { externalId?: string | null; username?: string | null },
	active: boolean,
): void {
	const config = getIspApiConfigFromEnv();
	if (!config) {
		return;
	}

	// Need either externalId or username to identify the user in iRadius
	if (!customer.externalId && !customer.username) {
		return;
	}

	const body: Record<string, unknown> = { active };
	if (customer.externalId) {
		body["userId"] = Number.parseInt(customer.externalId, 10);
	} else {
		body["username"] = customer.username;
	}

	const attempt = (retries: number) => {
		ispPost(config, "/activate-user", body).catch((error) => {
			if (retries > 0) {
				setTimeout(() => attempt(retries - 1), 2000);
				return;
			}
			logger.error("Failed to sync active status to iRadius", {
				externalId: customer.externalId,
				username: customer.username,
				active,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		});
	};
	attempt(2);
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
