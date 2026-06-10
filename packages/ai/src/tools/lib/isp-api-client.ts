import { logger } from "@repo/logs";
import { toNationalDigits } from "@repo/utils";
import type { ConfigField, ToolContext } from "../types";

export function getIspApiConfigFields(): ConfigField[] {
	return [
		{
			key: "ispBaseUrl",
			label: "ISP API Base URL",
			type: "text",
			required: true,
			placeholder: "https://api.your-isp.com",
			defaultValue: process.env["ISP_API_BASE_URL"],
		},
		{
			key: "ispUsername",
			label: "ISP API Username",
			type: "text",
			required: true,
			defaultValue: process.env["ISP_API_USERNAME"],
		},
		{
			key: "ispPassword",
			label: "ISP API Password",
			type: "password",
			required: true,
			defaultValue: process.env["ISP_API_PASSWORD"],
		},
	];
}

export interface IspApiConfig {
	baseUrl: string;
	userName: string;
	password: string;
}

/**
 * Clean a phone number for the iRadius `/user-info` API (bare digits, no
 * country code, no leading 0).
 *
 * iRadius stores Lebanese phones in three historical formats: international
 * (`+961XXXXXXX`), domestic with leading zero (`0XXXXXXX`), and bare digits
 * (`XXXXXXX`). The endpoint does a substring `LIKE` match, so we output the
 * bare-national form which substring-matches all three shapes.
 *
 * This delegates to {@link toNationalDigits} (libphonenumber-js) for the
 * actual parsing — that handles every country code uniformly and avoids the
 * earlier hand-rolled +961/00961/961 branching. Usernames and other
 * non-phone strings pass through digit-stripped (so `josephuser` becomes
 * empty, which the caller handles via {@link isSearchableQuery}).
 *
 * Examples:
 *   +96171234567  → 71234567   (Lebanese mobile)
 *   9611234567    → 1234567    (no plus, parsed as +961 1234567)
 *   03 123 456    → 3123456    (domestic, leading 0 stripped)
 *   +963998184707 → 998184707  (Syrian — still bare-national)
 *   71234567      → 71234567   (already bare; parsed with default LB)
 */
export function cleanPhoneNumber(phone: string): string {
	// Strip whitespace/punctuation up front so the parser sees clean input.
	const cleaned = phone.trim().replace(/[\s\-().]/g, "");
	return toNationalDigits(cleaned);
}

/**
 * Legacy alias — prefer {@link cleanPhoneNumber}.
 * Kept because `whish-money-guard.ts` still imports it.
 */
export function normalizeLebanesPhone(phone: string): string {
	return cleanPhoneNumber(phone);
}

/**
 * Prepare a customer-lookup query for iRadius endpoints whose SQL matches
 * `u.Mobile LIKE %?% OR u.Phone LIKE %?% OR u.UserName = ?` (i.e. `/user-info`,
 * `/user-ping`, `/user-stat`).
 *
 * If the input contains any non-phone character (letter, etc.), treat it as a
 * PPPoE/Hotspot username and pass it through verbatim so the API's
 * `UserName = ?` branch fires. Otherwise normalize via `cleanPhoneNumber` so
 * it substring-matches across iRadius' three historical phone storage shapes.
 *
 * Without this branching, usernames like `col2023` get digit-stripped to
 * `2023` and substring-match unrelated customers whose phones happen to
 * contain "2023".
 */
export function cleanIspLookupQuery(query: string): string {
	const trimmed = query.trim();
	if (/[^\d+\-.()\s]/.test(trimmed)) {
		return trimmed;
	}
	return cleanPhoneNumber(trimmed);
}

/**
 * Whether a query is something the iRadius `/user-info` endpoint can usefully match.
 *
 * The endpoint searches `u.Mobile`/`u.Phone` (substring LIKE) and `u.UserName`
 * (exact). Non-ASCII queries (Arabic names, etc.) match accidentally against
 * UTF-8-corrupted Mobile data in iRadius and return unrelated customers — so
 * we refuse those at the tool boundary and ask for a phone or username.
 */
export function isSearchableQuery(query: string): boolean {
	const trimmed = query.trim();
	if (trimmed.length === 0) {
		return false;
	}
	for (const ch of trimmed) {
		const code = ch.codePointAt(0) ?? 0;
		if (code < 0x20 || code > 0x7e) {
			return false;
		}
	}
	// Multi-word queries containing letters are personal names in Latin
	// script ("Wadih El Haddad"): usernames never contain spaces and phones
	// never contain letters. Passing them through used to run an exact
	// UserName match, guaranteed to miss — and the model then told the
	// customer "no account exists" as fact.
	if (/\s/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
		return false;
	}
	return true;
}

/**
 * Resolve a single ISP customer record from the messaging provider's verified
 * phone (e.g. WhatsApp `cleanedSenderPn` on the conversation contact).
 *
 * Why this exists: agents will otherwise search by whatever name/string the
 * customer types, which used to false-match unrelated accounts via iRadius'
 * latin1 Mobile column. The verified phone is the only identifier we can
 * trust without asking the customer to repeat themselves. Tools call this
 * before honouring the agent-provided `query` so the phone wins ties.
 *
 * Returns `null` if no contact phone, the API errors, or the result is
 * ambiguous (0 or >1 match — both cases should fall back to `args.query`
 * search so shared family numbers don't lock the agent onto one account).
 */
export async function lookupCustomerByContactPhone(
	config: IspApiConfig,
	contactPhone: string | undefined,
): Promise<Record<string, unknown> | null> {
	if (!contactPhone) {
		return null;
	}
	const cleaned = cleanPhoneNumber(contactPhone);
	if (cleaned.length < 6) {
		return null;
	}
	try {
		const data = await ispGet<
			Record<string, unknown> | Record<string, unknown>[] | null
		>(config, "/user-info", { mobile: cleaned });
		if (!data) {
			return null;
		}
		const list = Array.isArray(data) ? data : [data];
		if (list.length !== 1) {
			return null;
		}
		return list[0] ?? null;
	} catch {
		return null;
	}
}

/**
 * Extract and validate ISP API config from tool context.
 * Falls back to environment variables when per-agent config is not set.
 */
export function getIspApiConfig(
	context: ToolContext,
): { ok: true; config: IspApiConfig } | { ok: false; error: string } {
	const baseUrl =
		(context.toolConfig?.["ispBaseUrl"] as string | undefined) ||
		process.env["ISP_API_BASE_URL"];
	const userName =
		(context.toolConfig?.["ispUsername"] as string | undefined) ||
		process.env["ISP_API_USERNAME"];
	const password =
		(context.toolConfig?.["ispPassword"] as string | undefined) ||
		process.env["ISP_API_PASSWORD"];

	if (!baseUrl || !userName || !password) {
		return {
			ok: false,
			error: "ISP API is not configured. Please set the ISP API Base URL, Username, and Password in the tool settings.",
		};
	}

	return {
		ok: true,
		config: {
			baseUrl: baseUrl.replace(/\/+$/, ""),
			userName,
			password,
		},
	};
}

// JWT token cache: key = "baseUrl|userName", value = { token, expiresAt }
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function cacheKey(config: IspApiConfig): string {
	return `${config.baseUrl}|${config.userName}`;
}

async function authenticate(config: IspApiConfig): Promise<string> {
	const res = await fetch(`${config.baseUrl}/authenticate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			userName: config.userName,
			password: config.password,
		}),
	});

	if (!res.ok) {
		throw new Error(`ISP API authentication failed (HTTP ${res.status})`);
	}

	const token = await res.text();
	return token.trim();
}

async function getToken(config: IspApiConfig): Promise<string> {
	const key = cacheKey(config);
	const cached = tokenCache.get(key);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.token;
	}

	const token = await authenticate(config);
	// Cache for 55 minutes (token TTL is 1 hour)
	tokenCache.set(key, {
		token,
		expiresAt: Date.now() + 55 * 60 * 1000,
	});

	return token;
}

function clearToken(config: IspApiConfig): void {
	tokenCache.delete(cacheKey(config));
}

// 5xx backoff schedule in ms — up to 3 attempts total (initial + 2 retries).
// iRadius API has known intermittent 500/502 hiccups; one quick retry catches
// the bulk of them without making slow paths painful.
const FIVE_XX_BACKOFF_MS = [200, 800];

/**
 * Run an authenticated request with one 401 retry (fresh token) and a small
 * number of 5xx retries with backoff. Caller provides a `send(token)` thunk
 * so this works for both GET and POST without duplicating fetch wiring.
 */
async function sendWithRetries(
	config: IspApiConfig,
	send: (token: string) => Promise<Response>,
): Promise<Response> {
	let token = await getToken(config);
	let res = await send(token);

	if (res.status === 401) {
		clearToken(config);
		token = await getToken(config);
		res = await send(token);
	}

	for (const delay of FIVE_XX_BACKOFF_MS) {
		if (res.status < 500 || res.status > 599) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, delay));
		res = await send(token);
	}

	// 5xx backoff can outlive the JWT TTL — re-mint and retry once if the
	// server now answers with 401.
	if (res.status === 401) {
		clearToken(config);
		token = await getToken(config);
		res = await send(token);
	}

	return res;
}

/**
 * Authenticated GET request to the ISP API.
 * Handles JWT auth (401 retry) and intermittent 5xx (backoff retry).
 */
export async function ispGet<T>(
	config: IspApiConfig,
	path: string,
	params: Record<string, string>,
): Promise<T> {
	const url = new URL(`${config.baseUrl}${path}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const res = await sendWithRetries(config, (token) =>
		fetch(url.toString(), {
			headers: { Authorization: `Bearer ${token}` },
		}),
	);

	if (!res.ok) {
		throw new Error(
			`ISP API request failed: ${res.status} ${res.statusText}`,
		);
	}

	const text = await res.text();
	if (!text) {
		return null as T;
	}

	return JSON.parse(text) as T;
}

/**
 * Authenticated POST request to the ISP API.
 * Handles JWT auth (401 retry) and intermittent 5xx (backoff retry).
 */
export async function ispPost<T>(
	config: IspApiConfig,
	path: string,
	body: Record<string, unknown>,
): Promise<T> {
	const url = `${config.baseUrl}${path}`;

	const res = await sendWithRetries(config, (token) =>
		fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		}),
	);

	if (!res.ok) {
		throw new Error(
			`ISP API request failed: ${res.status} ${res.statusText}`,
		);
	}

	const text = await res.text();
	if (!text) {
		return null as T;
	}

	return JSON.parse(text) as T;
}

/**
 * Wrapper that handles the common try/catch pattern for ISP tools.
 * Returns a structured error response on failure.
 */
export async function withIspErrorHandling<T>(
	context: ToolContext,
	toolName: string,
	fn: (config: IspApiConfig) => Promise<T>,
): Promise<T | { success: false; message: string }> {
	const result = getIspApiConfig(context);
	if (!result.ok) {
		return { success: false, message: result.error };
	}

	try {
		return await fn(result.config);
	} catch (error) {
		logger.error(`ISP tool ${toolName} failed`, {
			organizationId: context.organizationId,
			error: error instanceof Error ? error.message : "Unknown error",
		});
		return {
			success: false,
			message: `ISP API request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
