import { ORPCError } from "@orpc/server";
import { decryptToken } from "@repo/ai";
import { db } from "@repo/database";
import { createSaltiClient, type SaltiClient } from "@repo/integrations";

const DEFAULT_ENDPOINT = "https://saltimarketing.com/";

export interface SaltiCredentialSource {
	endpoint: string;
	token: string;
	source: "org" | "env";
}

/**
 * Resolve Salti credentials for an org. Per-org DB row wins; env fallback
 * (SALTI_API_TOKEN / SALTI_API_ENDPOINT) covers single-tenant deployments
 * where the same token serves every org.
 */
export async function resolveSaltiCredentials(
	organizationId: string,
): Promise<SaltiCredentialSource | null> {
	const integration = await db.saltiIntegration.findUnique({
		where: { organizationId },
	});
	if (integration) {
		return {
			endpoint: integration.apiEndpoint,
			token: decryptToken(integration.encryptedApiToken),
			source: "org",
		};
	}
	// Reuse the existing WPBOX_TOKEN env var (Salti is the WPBox provider).
	// SALTI_API_TOKEN remains accepted for clarity / future split.
	const envToken =
		process.env["SALTI_API_TOKEN"] ?? process.env["WPBOX_TOKEN"];
	if (envToken) {
		return {
			endpoint: process.env["SALTI_API_ENDPOINT"] ?? DEFAULT_ENDPOINT,
			token: envToken,
			source: "env",
		};
	}
	return null;
}

/**
 * Load the Salti integration for an org and return a configured client.
 * Throws ORPCError("NOT_FOUND") when neither a per-org row nor env fallback
 * is configured.
 */
export async function getSaltiClientForOrg(
	organizationId: string,
): Promise<SaltiClient> {
	const creds = await resolveSaltiCredentials(organizationId);
	if (!creds) {
		throw new ORPCError("NOT_FOUND", {
			message:
				"Salti is not configured. Add an API token in Settings → Marketing or set SALTI_API_TOKEN in the environment.",
		});
	}
	return createSaltiClient({
		endpoint: creds.endpoint,
		token: creds.token,
	});
}
