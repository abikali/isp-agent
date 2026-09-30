import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { checkRateLimit } from "@repo/rate-limit";
import z from "zod";
import {
	authenticateOrgRequest,
	jsonResponse,
} from "../../api-keys/lib/authenticate-org-request";
import { resetMacForCustomer } from "./reset-mac";

/**
 * Reset a customer's MAC from the Telegram ISP bot (admin-only on the bot
 * side, which also asks for confirmation).
 *
 * POST /api/customer-reset-mac/:organizationSlug
 * Header `x-api-key` with `write:customer-mac` (or `write:*` / `*`).
 * Body `{ customer_username, telegram_id?, telegram_name? }`.
 *
 * Same write as the web action: iRadius first (`UserNas.MacAddress = NULL`),
 * then the local mirror, then a `customer.mac_reset` audit row attributed to
 * the key's creator with the Telegram identity in its metadata.
 */

const BodySchema = z.object({
	customer_username: z.string().trim().min(1).max(64),
	telegram_id: z.coerce.string().trim().max(64).optional(),
	telegram_name: z.string().trim().max(128).optional(),
});

export async function customerResetMacHandler(
	request: Request,
	organizationSlug: string,
): Promise<Response> {
	const auth = await authenticateOrgRequest(
		request,
		organizationSlug,
		"write:customer-mac",
	);
	if (!auth.ok) {
		return auth.response;
	}
	const { organizationId, apiKey } = auth;

	const rate = await checkRateLimit("api", {
		type: "api-key",
		keyId: apiKey.id,
	});
	if (!rate.allowed) {
		return jsonResponse(
			{ success: false, error: "Rate limit exceeded" },
			429,
			{ "Retry-After": String(rate.retryAfter) },
		);
	}

	const parsed = BodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return jsonResponse(
			{ success: false, error: "customer_username is required" },
			400,
		);
	}
	const {
		customer_username: username,
		telegram_id,
		telegram_name,
	} = parsed.data;

	const [organization, customer] = await Promise.all([
		db.organization.findUnique({
			where: { id: organizationId },
			select: { iradiusDisabled: true },
		}),
		db.customer.findFirst({
			where: { organizationId, username, deletedAt: null },
			select: { id: true, externalId: true, macAddress: true },
		}),
	]);
	if (organization?.iradiusDisabled) {
		return jsonResponse(
			{
				success: false,
				error: "iRadius is disabled for this organization",
			},
			400,
		);
	}
	if (!customer?.externalId) {
		return jsonResponse(
			{
				success: false,
				error: customer
					? `Customer is not linked to iRadius: ${username}`
					: `Customer not found: ${username}`,
			},
			404,
		);
	}

	try {
		await resetMacForCustomer({
			organizationId,
			customer: { id: customer.id, externalId: customer.externalId },
			actorUserId: apiKey.createdById,
			auditContext: {},
			metadata: {
				via: "telegram",
				telegramId: telegram_id,
				telegramName: telegram_name,
				previousMac: customer.macAddress,
			},
		});
	} catch (error) {
		return jsonResponse(
			{
				success: false,
				error:
					error instanceof ORPCError
						? error.message
						: "Failed to reset MAC address in iRadius",
			},
			502,
		);
	}

	logger.info("[Reset MAC] reset via Telegram", {
		organizationSlug,
		username,
		telegramId: telegram_id,
	});

	return jsonResponse({ success: true, username });
}
