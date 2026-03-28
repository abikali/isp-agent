import { logger } from "@repo/logs";

/**
 * Normalize a Lebanese phone number to international format (961XXXXXXXX).
 */
function normalizeLebanonPhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("961")) {
		return digits;
	}
	if (digits.startsWith("0")) {
		return `961${digits.slice(1)}`;
	}
	return `961${digits}`;
}

/**
 * Send a WhatsApp payment receipt via the WPBox API.
 *
 * Uses the `success_payment_url` template which includes an invoice URL button.
 * Returns true if the API accepted the request.
 */
export async function sendWhatsAppReceipt(params: {
	phone: string;
	paymentId: string;
}): Promise<boolean> {
	const token = process.env["WPBOX_TOKEN"];
	if (!token) {
		logger.warn(
			"[WhatsApp Receipt] WPBOX_TOKEN not set, skipping receipt send",
		);
		return false;
	}

	const phone = normalizeLebanonPhone(params.phone);
	if (phone.length < 10) {
		logger.warn("[WhatsApp Receipt] Invalid phone number", { phone });
		return false;
	}

	const payload = {
		token,
		phone,
		template_name: "success_payment_url",
		template_language: "en_US",
		components: [
			{
				type: "button",
				sub_type: "url",
				index: "0",
				parameters: [
					{
						type: "text",
						text: params.paymentId,
					},
				],
			},
		],
	};

	try {
		const response = await fetch(
			"https://saltimarketing.com/api/wpbox/sendtemplatemessage",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(15000),
			},
		);

		if (response.ok) {
			logger.info("[WhatsApp Receipt] Sent successfully", {
				phone,
				paymentId: params.paymentId,
			});
			return true;
		}

		logger.warn("[WhatsApp Receipt] API returned non-OK", {
			status: response.status,
			phone,
		});
		return false;
	} catch (error) {
		logger.warn("[WhatsApp Receipt] Failed to send", {
			error: error instanceof Error ? error.message : String(error),
			phone,
		});
		return false;
	}
}
