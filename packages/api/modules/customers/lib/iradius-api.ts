import { type IspApiConfig, ispPost } from "@repo/ai/isp-api-client";
import { logger } from "@repo/logs";

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
