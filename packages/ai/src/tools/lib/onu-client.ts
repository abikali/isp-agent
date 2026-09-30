/**
 * Client for the Telegram ISP bot's `GET /api/onu-status`. The bot owns the
 * telnet sessions to the OLTs (one pooled session, a mutex and a cache per
 * OLT), so the app asks it instead of opening its own.
 *
 * Env: `TG_ISP_BOT_URL` (e.g. https://tg-isp.abiroot.dev) and
 * `TG_ISP_ONU_API_KEY` (the bot's `ONU_API_KEY`).
 *
 * Never throws: every failure comes back as `result: "error"` so callers can
 * show "ONU status unavailable" and carry on.
 */

export interface OnuInfo {
	status: string;
	onuId: string;
	macAddress: string | null;
	distanceMeters: number | null;
	aliveTime: string | null;
	lastRegTime: string | null;
	lastDeregTime: string | null;
	lastDeregReason: string | null;
	opticalInfo?: Record<string, unknown> | null;
	portInfo?: Record<string, unknown> | null;
}

export interface OnuStatusResult {
	applicable: boolean;
	olt: "OLT1" | "OLT2" | null;
	port: string | null;
	description: string | null;
	/** Absent when `applicable` is false (not an OLT interface). */
	result?: "found" | "not_found" | "error";
	onu?: OnuInfo;
	offlineUnidentified?: number;
	cached?: boolean;
	fetchedAt?: string;
	error?: string;
}

function failure(error: string): OnuStatusResult {
	return {
		applicable: true,
		olt: null,
		port: null,
		description: null,
		result: "error",
		error,
	};
}

export async function getOnuStatus(
	mikrotikInterface: string,
	opts: { timeoutMs: number },
): Promise<OnuStatusResult> {
	const baseUrl = process.env["TG_ISP_BOT_URL"];
	const apiKey = process.env["TG_ISP_ONU_API_KEY"];
	if (!baseUrl || !apiKey) {
		return failure("ONU lookup is not configured");
	}

	const url = new URL("/api/onu-status", baseUrl);
	url.searchParams.set("interface", mikrotikInterface);

	let response: Response;
	try {
		response = await fetch(url, {
			headers: { "x-api-key": apiKey },
			signal: AbortSignal.timeout(opts.timeoutMs),
		});
	} catch (error) {
		return failure(
			error instanceof Error && error.name === "TimeoutError"
				? "ONU lookup timed out"
				: "Could not reach the ONU service",
		);
	}

	if (response.status === 401) {
		return failure("ONU service rejected the API key");
	}
	if (!response.ok) {
		return failure(`ONU service answered ${response.status}`);
	}
	try {
		return (await response.json()) as OnuStatusResult;
	} catch {
		return failure("ONU service returned an invalid response");
	}
}
