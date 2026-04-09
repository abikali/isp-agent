import { logger } from "@repo/logs";
import { normalizePhone } from "@repo/utils";

interface TemplateComponent {
	type: string;
	sub_type?: string;
	index?: string;
	parameters: Array<{ type: string; text: string }>;
}

/**
 * Send a templated message via the WPBox API. Returns true on 2xx, false
 * otherwise (with a logged warning). Never throws.
 */
async function sendWPBoxTemplate(params: {
	phone: string;
	templateName: string;
	templateLanguage?: string;
	components: TemplateComponent[];
	logContext: Record<string, unknown>;
	logTag: string;
}): Promise<boolean> {
	const token = process.env["WPBOX_TOKEN"];
	if (!token) {
		logger.warn(`${params.logTag} WPBOX_TOKEN not set, skipping send`);
		return false;
	}

	const phone = normalizePhone(params.phone);
	if (phone.length < 10) {
		logger.warn(`${params.logTag} Invalid phone number`, { phone });
		return false;
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
				signal: AbortSignal.timeout(15000),
			},
		);

		if (response.ok) {
			logger.info(`${params.logTag} Sent successfully`, {
				phone,
				...params.logContext,
			});
			return true;
		}

		logger.warn(`${params.logTag} API returned non-OK`, {
			status: response.status,
			phone,
		});
		return false;
	} catch (error) {
		logger.warn(`${params.logTag} Failed to send`, {
			error: error instanceof Error ? error.message : String(error),
			phone,
		});
		return false;
	}
}

/**
 * Send a WhatsApp payment receipt — uses the `success_payment_url` template
 * with an invoice URL button.
 */
export async function sendWhatsAppReceipt(params: {
	phone: string;
	paymentId: string;
}): Promise<boolean> {
	return sendWPBoxTemplate({
		phone: params.phone,
		templateName: "success_payment_url",
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
	return sendWPBoxTemplate({
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
}
