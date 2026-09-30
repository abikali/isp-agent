import type { SendSmsParams, SmsResult } from "../../types";

const DEFAULT_ENDPOINT = "https://globesms.net/smshub/api.php";
const DEFAULT_SENDER_ID = "Libancom";
const TIMEOUT_MS = 15_000;

/**
 * Send an SMS through GlobeSMS (Lebanese aggregator). One account for the
 * whole platform, read from env: `GLOBESMS_USERNAME`, `GLOBESMS_PASSWORD`,
 * `SMS_SENDER_ID` (default "Libancom"), optional `GLOBESMS_ENDPOINT`.
 *
 * Request (GET):
 *   {endpoint}?username=&password=&action=sendsms&from={senderId}&to={to}&text={body}
 *
 * Response is plain text: "OK: <count>" on success, "ERR: <reason>" on
 * failure. Never throws — network errors and HTTP 5xx come back as
 * `retriable: true`, `ERR:` answers as permanent failures.
 */
export async function sendSms(params: SendSmsParams): Promise<SmsResult> {
	const username = process.env["GLOBESMS_USERNAME"];
	const password = process.env["GLOBESMS_PASSWORD"];
	if (!username || !password) {
		return { success: false, raw: "", error: "SMS not configured" };
	}

	const url = new URL(process.env["GLOBESMS_ENDPOINT"] || DEFAULT_ENDPOINT);
	url.searchParams.set("username", username);
	url.searchParams.set("password", password);
	url.searchParams.set("action", "sendsms");
	url.searchParams.set(
		"from",
		params.senderId || process.env["SMS_SENDER_ID"] || DEFAULT_SENDER_ID,
	);
	url.searchParams.set("to", params.to);
	url.searchParams.set("text", params.body);

	let response: Response;
	let raw: string;
	try {
		response = await fetch(url, {
			method: "GET",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		raw = (await response.text()).trim();
	} catch (error) {
		return {
			success: false,
			raw: "",
			error: `GlobeSMS request failed: ${error instanceof Error ? error.message : "unknown error"}`,
			retriable: true,
		};
	}

	if (response.status >= 500) {
		return {
			success: false,
			raw,
			error: `GlobeSMS returned HTTP ${response.status}`,
			retriable: true,
		};
	}

	return parseGlobeSmsResponse(raw);
}

/**
 * Parse a GlobeSMS plain-text response into a structured result.
 * Exported for unit testing.
 */
export function parseGlobeSmsResponse(raw: string): SmsResult {
	const trimmed = raw.trim();
	if (/^OK\b/i.test(trimmed)) {
		const messageId = trimmed.split(":")[1]?.trim();
		return messageId
			? { success: true, providerMessageId: messageId, raw: trimmed }
			: { success: true, raw: trimmed };
	}
	const error = trimmed.replace(/^ERR:?\s*/i, "").trim();
	return {
		success: false,
		raw: trimmed,
		error: error || "Unknown SMS provider error",
		retriable: false,
	};
}
