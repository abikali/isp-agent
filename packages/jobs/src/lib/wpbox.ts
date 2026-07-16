import { logger } from "@repo/logs";
import { normalizePhone } from "@repo/utils";

interface TemplateComponent {
	type: string;
	sub_type?: string;
	index?: string;
	parameters: Array<{ type: string; text: string }>;
}

const DEFAULT_WPBOX_TIMEOUT_MS = 15_000;

function getWpboxTimeoutMs(): number {
	const raw = process.env["WPBOX_TIMEOUT_MS"];
	if (!raw) {
		return DEFAULT_WPBOX_TIMEOUT_MS;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEFAULT_WPBOX_TIMEOUT_MS;
}

/**
 * Discriminated result from a WPBox template send. Callers that only
 * need a yes/no signal should use the `sendWhatsApp*` convenience wrappers
 * below, which extract `.ok` for backward-compat boolean returns. The
 * `whatsapp-receipt` worker needs the full shape so it can distinguish
 * transient (5xx — retriable) from permanent (4xx — skip) failures and
 * log the status code into the payment's activity log.
 */
export type WPBoxSendResult =
	| { ok: true; phone: string; status: number }
	| {
			ok: false;
			phone: string;
			status?: number;
			error: string;
			retriable: boolean;
	  };

/**
 * Send a templated message via the WPBox API. Never throws — returns a
 * typed result instead so callers can decide whether to retry.
 *
 * Shared between the API layer (inline single-customer sends) and the
 * BullMQ workers (bulk/async sends).
 */
export async function sendWPBoxTemplate(params: {
	phone: string;
	templateName: string;
	templateLanguage?: string;
	components: TemplateComponent[];
	logContext: Record<string, unknown>;
	logTag: string;
}): Promise<WPBoxSendResult> {
	const token = process.env["WPBOX_TOKEN"];
	if (!token) {
		logger.warn(`${params.logTag} WPBOX_TOKEN not set, skipping send`);
		return {
			ok: false,
			phone: params.phone,
			error: "WPBOX_TOKEN not set",
			retriable: false,
		};
	}

	const phone = normalizePhone(params.phone);
	if (phone.length < 10) {
		logger.warn(`${params.logTag} Invalid phone number`, { phone });
		return {
			ok: false,
			phone,
			error: "Invalid phone number",
			retriable: false,
		};
	}

	try {
		const response = await fetch(
			"https://saltimarketing.com/api/wpbox/sendtemplatemessage",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token,
					phone,
					template_name: params.templateName,
					template_language: params.templateLanguage ?? "en_US",
					components: params.components,
				}),
				signal: AbortSignal.timeout(getWpboxTimeoutMs()),
			},
		);

		if (response.ok) {
			logger.info(`${params.logTag} Sent successfully`, {
				phone,
				...params.logContext,
			});
			return { ok: true, phone, status: response.status };
		}

		logger.warn(`${params.logTag} API returned non-OK`, {
			status: response.status,
			phone,
		});
		return {
			ok: false,
			phone,
			status: response.status,
			error: `API returned ${response.status}`,
			retriable: response.status >= 500,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`${params.logTag} Failed to send`, {
			error: message,
			phone,
		});
		return {
			ok: false,
			phone,
			error: message,
			// Network/abort errors are almost always transient.
			retriable: true,
		};
	}
}

/**
 * Send a WhatsApp payment receipt — uses the `success_payment_url_v2`
 * template with an invoice URL button. Returns the full WPBox result so
 * the worker can inspect status codes for activity-log bookkeeping.
 *
 * v2 (created 2026-07-16): the original `success_payment_url` template's
 * button pointed at the decommissioned legacy billing server
 * (billing.libancomlb.com → Cloudflare 522). Salti templates are locked
 * once approved, so the fix is a new template whose button URL is
 * `https://cp.libancomlb.com/invoice/{{1}}` (the public /invoice/$paymentId
 * route). Do not switch back.
 */
export async function sendWhatsAppReceipt(params: {
	phone: string;
	paymentId: string;
}): Promise<WPBoxSendResult> {
	return sendWPBoxTemplate({
		phone: params.phone,
		templateName: "success_payment_url_v2",
		components: [
			{
				type: "button",
				sub_type: "url",
				index: "0",
				parameters: [{ type: "text", text: params.paymentId }],
			},
		],
		logContext: { paymentId: params.paymentId },
		logTag: "[WhatsApp Receipt]",
	});
}

/**
 * Send a WhatsApp location-request — uses the `location_request_url`
 * template with one body parameter (first name) and a button URL parameter
 * (the token, appended to the configured public app URL).
 */
export async function sendWhatsAppLocationRequest(params: {
	phone: string;
	token: string;
	customerName?: string | null;
}): Promise<boolean> {
	const result = await sendWPBoxTemplate({
		phone: params.phone,
		templateName: "location_request_url",
		components: [
			{
				type: "body",
				parameters: [
					{ type: "text", text: params.customerName ?? "there" },
				],
			},
			{
				type: "button",
				sub_type: "url",
				index: "0",
				parameters: [{ type: "text", text: params.token }],
			},
		],
		logContext: { token: params.token },
		logTag: "[WhatsApp Location Request]",
	});
	return result.ok;
}

/**
 * Notify a customer that a maintenance visit is scheduled — uses the
 * `maintenance_visit` template with three body parameters: customer first
 * name, worker name, and worker phone. The template must exist in WPBox.
 */
export async function sendWhatsAppMaintenanceVisit(params: {
	phone: string;
	customerName?: string | null;
	workerName?: string | null;
	workerPhone?: string | null;
}): Promise<boolean> {
	const result = await sendWPBoxTemplate({
		phone: params.phone,
		templateName: "maintenance_visit",
		components: [
			{
				type: "body",
				parameters: [
					{ type: "text", text: params.customerName ?? "there" },
					{
						type: "text",
						text: params.workerName ?? "our technician",
					},
					{ type: "text", text: params.workerPhone ?? "-" },
				],
			},
		],
		logContext: { workerName: params.workerName },
		logTag: "[WhatsApp Maintenance Visit]",
	});
	return result.ok;
}
