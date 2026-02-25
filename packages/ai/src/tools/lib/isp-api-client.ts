import { logger } from "@repo/logs";
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

/** Strip leading +961 / 961, spaces, and dashes from a phone number. */
export function cleanPhoneNumber(phone: string): string {
	let cleaned = phone.trim().replace(/[\s-]/g, "");
	if (cleaned.startsWith("+961")) {
		cleaned = cleaned.slice(4);
	} else if (cleaned.startsWith("961")) {
		cleaned = cleaned.slice(3);
	}
	return cleaned;
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

/**
 * Authenticated GET request to the ISP API.
 * Automatically handles JWT auth and retries once on 401.
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

	const token = await getToken(config);
	let res = await fetch(url.toString(), {
		headers: { Authorization: `Bearer ${token}` },
	});

	// Retry once on 401 with a fresh token
	if (res.status === 401) {
		clearToken(config);
		const freshToken = await getToken(config);
		res = await fetch(url.toString(), {
			headers: { Authorization: `Bearer ${freshToken}` },
		});
	}

	if (!res.ok) {
		throw new Error(
			`ISP API request failed: ${res.status} ${res.statusText}`,
		);
	}

	return (await res.json()) as T;
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
