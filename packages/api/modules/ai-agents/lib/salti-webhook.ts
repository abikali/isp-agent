import { timingSafeEqual } from "node:crypto";
import { queueSaltiInbound } from "@repo/jobs";
import { logger } from "@repo/logs";

/**
 * Salti (WPBox) "WebHooks → Whatsapp received data will be resend to":
 * WPBox posts Meta's raw Cloud-API webhook body here, once, unsigned and
 * without retries. The URL carries a secret; the body is queued and the
 * answer is always a fast 200 so WPBox never waits on us.
 */
export function isValidSaltiSecret(
	provided: string,
	expected: string | undefined,
): boolean {
	if (!expected || !provided) {
		return false;
	}
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

export async function saltiWebhookHandler(
	request: Request,
	secret: string,
): Promise<Response> {
	if (!isValidSaltiSecret(secret, process.env["SALTI_WEBHOOK_SECRET"])) {
		return new Response("Not found", { status: 404 });
	}
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response("OK", { status: 200 });
	}
	try {
		await queueSaltiInbound(body);
	} catch (error) {
		logger.error("[salti-webhook] could not queue inbound body", {
			error,
		});
	}
	return new Response("OK", { status: 200 });
}
