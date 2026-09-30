import type { SaltiSendResult } from "@repo/integrations";
import { logger } from "@repo/logs";
import { parsePhone } from "@repo/utils";

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
 * 5xx and 429 are transient. 404 is too: during the 2026-09-04 WPBox outage
 * the endpoint answered 404 for hours before recovering, and every receipt
 * that hit it was dropped as a permanent failure.
 */
function isRetriableStatus(status: number): boolean {
	return status >= 500 || status === 404 || status === 429;
}

/**
 * Discriminated result from a WPBox template send. Callers that only
 * need a yes/no signal should use the `sendWhatsApp*` convenience wrappers
 * below, which extract `.ok` for backward-compat boolean returns. The
 * `whatsapp-receipt` worker needs the full shape so it can distinguish
 * transient (5xx/404/429 / network — retriable) from permanent (other 4xx,
 * rejected template, bad phone — skip) failures and log the status code into
 * the payment's activity log.
 */
export type WPBoxSendResult =
	| { ok: true; phone: string; status: number; messageId: string | null }
	| {
			ok: false;
			phone: string;
			status?: number;
			error: string;
			retriable: boolean;
	  };

/**
 * WPBox answers HTTP 200 for rejected sends too (`{status:"error",
 * message:"Invalid template"}`, or `wa_error_code` + `error_message` when
 * WhatsApp itself refuses), so the body — not the HTTP status — decides
 * success. Prefer the WhatsApp-level reason over Salti's generic `message`.
 */
function describeWPBoxFailure(
	body: SaltiSendResult | null,
	rawText: string,
	httpStatus: number,
): string {
	if (body?.error_message) {
		return body.wa_error_code
			? `${body.wa_error_code}: ${body.error_message}`
			: body.error_message;
	}
	if (body?.message) {
		return body.message;
	}
	// Keep what WPBox said — "API returned 404" alone couldn't tell an
	// outage page from a rejected template when triaging Sep 4.
	return rawText
		? `API returned ${httpStatus}: ${rawText}`
		: `API returned ${httpStatus}`;
}

/**
 * Read the body once: the parsed JSON (when it is an object) for the success
 * check, and a short whitespace-collapsed snippet of the raw text for errors.
 */
async function readBody(
	response: Response,
): Promise<{ json: SaltiSendResult | null; text: string }> {
	const raw = await response.text().catch(() => "");
	let json: SaltiSendResult | null = null;
	try {
		const parsed: unknown = JSON.parse(raw);
		json =
			parsed !== null && typeof parsed === "object"
				? (parsed as SaltiSendResult)
				: null;
	} catch {
		json = null;
	}
	return { json, text: raw.replace(/\s+/g, " ").trim().slice(0, 200) };
}

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

	// Only send to numbers libphonenumber validates. The old digit-strip
	// fallback turned junk (usernames, truncated numbers) into `961…`
	// strings that looked long enough to send.
	const phone = parsePhone(params.phone)?.digits;
	if (!phone) {
		logger.warn(`${params.logTag} Invalid phone number`, {
			phone: params.phone,
			...params.logContext,
		});
		return {
			ok: false,
			phone: params.phone,
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
		const { json: body, text: rawText } = await readBody(response);

		if (response.ok && body?.status === "success") {
			const messageId =
				body.message_id !== undefined && body.message_id !== null
					? String(body.message_id)
					: null;
			logger.info(`${params.logTag} Sent successfully`, {
				phone,
				messageId,
				...params.logContext,
			});
			return { ok: true, phone, status: response.status, messageId };
		}

		const error = describeWPBoxFailure(body, rawText, response.status);
		logger.warn(`${params.logTag} API returned error`, {
			status: response.status,
			error,
			phone,
			templateName: params.templateName,
			...params.logContext,
		});
		return {
			ok: false,
			phone,
			status: response.status,
			error,
			retriable: isRetriableStatus(response.status),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		logger.warn(`${params.logTag} Failed to send`, {
			error: message,
			phone,
			...params.logContext,
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
 * `maintenance_visit` template (UTILITY, Arabic) with three body parameters:
 * customer first name, worker name, and worker phone. Template body:
 * "مرحباً {{1}}، سيزورك الفني {{2}} قريباً بخصوص خدمة LibanCom. للتواصل معه: {{3}}. نشكر ثقتك بنا."
 * Until Meta approves it, WPBox rejects every send and this returns false.
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
		templateLanguage: "ar",
		components: [
			{
				type: "body",
				parameters: [
					{ type: "text", text: params.customerName || "عزيزنا" },
					{ type: "text", text: params.workerName || "من فريقنا" },
					{ type: "text", text: params.workerPhone || "هذا الرقم" },
				],
			},
		],
		logContext: { workerName: params.workerName },
		logTag: "[WhatsApp Maintenance Visit]",
	});
	return result.ok;
}

/**
 * Confirm money recorded on a dealer's account — `dealer_account_update`
 * (UTILITY, Arabic) from the official number. Seven body params, in order:
 * name, operation, amount, date, owed, prepaid credit, note. Dealer
 * confirmations used to go out from the support bot's WaSender number, which
 * risks a ban for business-initiated sends; they must stay on WPBox.
 */
export async function sendWhatsAppDealerAccountUpdate(params: {
	phone: string;
	params: string[];
	dealerAccountId: string;
}): Promise<WPBoxSendResult> {
	return sendWPBoxTemplate({
		phone: params.phone,
		templateName: "dealer_account_update",
		templateLanguage: "ar",
		components: [
			{
				type: "body",
				parameters: params.params.map((text) => ({
					type: "text",
					text,
				})),
			},
		],
		logContext: { dealerAccountId: params.dealerAccountId },
		logTag: "[WhatsApp Dealer Update]",
	});
}

// ── Referral reward ("free month") ─────────────────────────────────────────

/** Month names as written in Lebanon (Syriac calendar names). */
const MONTH_NAMES_AR = [
	"كانون الثاني",
	"شباط",
	"آذار",
	"نيسان",
	"أيار",
	"حزيران",
	"تموز",
	"آب",
	"أيلول",
	"تشرين الأول",
	"تشرين الثاني",
	"كانون الأول",
];

/** "أيلول 2026" for a billing month (1-based month). */
export function arabicMonthLabel(year: number, month: number): string {
	const name = MONTH_NAMES_AR[month - 1];
	return name ? `${name} ${year}` : `${month}/${year}`;
}

/**
 * Meta rejects template parameters that are empty or contain newlines, tabs
 * or more than four consecutive spaces — one bad customer name would fail
 * the whole send permanently.
 */
export function sanitizeTemplateParam(
	value: string | null | undefined,
	fallback: string,
	maxLength = 60,
): string {
	const clean = (value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
	return clean.trim() || fallback;
}

/**
 * Tell a referrer their free month was approved — `referral_free_month` (ar,
 * UTILITY): "مرحباً {{1}}، شكراً لأنك عرّفتنا على {{2}} 🎉 تمّت إضافة شهر
 * مجاني على اشتراكك عن شهر {{3}}. شكراً لثقتك بنا."
 * {{1}} referrer's name, {{2}} the new customer they brought, {{3}} the month.
 */
export async function sendWhatsAppReferralReward(params: {
	phone: string;
	paymentId: string;
	referrerName: string | null;
	referredName: string | null;
	year: number;
	month: number;
}): Promise<WPBoxSendResult> {
	return sendWPBoxTemplate({
		phone: params.phone,
		templateName: "referral_free_month",
		templateLanguage: "ar",
		components: [
			{
				type: "body",
				parameters: [
					{
						type: "text",
						text: sanitizeTemplateParam(
							params.referrerName,
							"عميلنا",
						),
					},
					{
						type: "text",
						text: sanitizeTemplateParam(
							params.referredName,
							"صديقك",
						),
					},
					{
						type: "text",
						text: arabicMonthLabel(params.year, params.month),
					},
				],
			},
		],
		logContext: { paymentId: params.paymentId },
		logTag: "[WhatsApp Referral Reward]",
	});
}

// ── Customer payment notifications (expiry reminder, stop notice) ──────────

/**
 * Day-before-expiry reminder for an unpaid invoice — `payment_reminder_tomorrow`
 * (ar, UTILITY). Body: "تذكير لعملائنا الكرام، نود تذكيركم بأن موعد تجديد
 * اشتراك الإنترنت هو غدًا {{1}}. يرجى التواصل مع جابي الاشتراك على رقمه {{2}}
 * لتسديد الاشتراك وتفادي انقطاع الخدمة. شكرًا لتعاونكم، Libancom".
 * {{1}} the expiry date as "(1/10/2026)", {{2}} the collector/office number.
 */
export async function sendWhatsAppExpiryReminder(params: {
	phone: string;
	expiryLabel: string;
	contactPhone: string;
	notificationId: string;
}): Promise<WPBoxSendResult> {
	return sendWPBoxTemplate({
		phone: params.phone,
		templateName: "payment_reminder_tomorrow",
		templateLanguage: "ar",
		components: [
			{
				type: "body",
				parameters: [
					{
						type: "text",
						text: sanitizeTemplateParam(params.expiryLabel, "غدًا"),
					},
					{
						type: "text",
						text: sanitizeTemplateParam(params.contactPhone, "-"),
					},
				],
			},
		],
		logContext: { notificationId: params.notificationId },
		logTag: "[WhatsApp Expiry Reminder]",
	});
}

/**
 * Pending stop request: the collector is trying to reach the customer —
 * `stop_request_notice` (ar, UTILITY). Body: "عزيزنا المشترك، نذكّركم بلطف أن
 * موعد تجديد الاشتراك قد حان، وموظف الجباية يحاول التواصل معكم. يرجى التواصل
 * معه على رقمه {{1}} لتفادي انقطاع الخدمة. شكرًا لتعاونكم، Libancom".
 * {{1}} the collector's number.
 */
export async function sendWhatsAppStopNotice(params: {
	phone: string;
	contactPhone: string;
	notificationId: string;
}): Promise<WPBoxSendResult> {
	return sendWPBoxTemplate({
		phone: params.phone,
		templateName: "stop_request_notice",
		templateLanguage: "ar",
		components: [
			{
				type: "body",
				parameters: [
					{
						type: "text",
						text: sanitizeTemplateParam(params.contactPhone, "-"),
					},
				],
			},
		],
		logContext: { notificationId: params.notificationId },
		logTag: "[WhatsApp Stop Notice]",
	});
}
