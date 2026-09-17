import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { hasPermission, verifyApiKey } from "./verify";

/**
 * Auth for plain Hono endpoints called by external services with an
 * `x-api-key` header (the Telegram ISP bot): the key must be valid, carry
 * `permission`, and belong to the organization named in the URL.
 */

export function jsonResponse(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

type AuthenticatedOrgRequest =
	| {
			ok: true;
			organizationId: string;
			apiKey: { id: string; createdById: string };
	  }
	| { ok: false; response: Response };

export async function authenticateOrgRequest(
	request: Request,
	organizationSlug: string,
	permission: string,
): Promise<AuthenticatedOrgRequest> {
	const plainKey = request.headers.get("x-api-key") ?? "";
	const verification = await verifyApiKey(plainKey);
	if (!verification.valid || !verification.apiKey) {
		logger.info("[API key] auth failed", {
			path: new URL(request.url).pathname,
			error: verification.error,
		});
		return {
			ok: false,
			response: jsonResponse(
				{ success: false, error: "Unauthorized" },
				401,
			),
		};
	}
	const apiKey = verification.apiKey;

	if (!hasPermission(apiKey.permissions, permission)) {
		return {
			ok: false,
			response: jsonResponse(
				{ success: false, error: "Insufficient permissions" },
				403,
			),
		};
	}

	const organization = await db.organization.findUnique({
		where: { slug: organizationSlug },
		select: { id: true },
	});
	if (!organization || organization.id !== apiKey.organizationId) {
		return {
			ok: false,
			response: jsonResponse(
				{
					success: false,
					error: "API key not valid for this organization",
				},
				403,
			),
		};
	}

	return {
		ok: true,
		organizationId: organization.id,
		apiKey: { id: apiKey.id, createdById: apiKey.createdById },
	};
}
