import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOnuStatus } from "../lib/onu-client";

describe("getOnuStatus", () => {
	beforeEach(() => {
		vi.stubEnv("TG_ISP_BOT_URL", "https://bot.example.com");
		vi.stubEnv("TG_ISP_ONU_API_KEY", "secret");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("calls the bot with the key and returns its body", async () => {
		const body = {
			applicable: true,
			olt: "OLT2",
			port: "0/5",
			description: "a3iyeblockA",
			result: "not_found",
			offlineUnidentified: 2,
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify(body), { status: 200 }),
			);
		vi.stubGlobal("fetch", fetchMock);
		const result = await getOnuStatus("x-OLT2-PON5-a3iyeblockA", {
			timeoutMs: 1000,
		});
		expect(result).toEqual(body);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(String(url)).toBe(
			"https://bot.example.com/api/onu-status?interface=x-OLT2-PON5-a3iyeblockA",
		);
		expect(init.headers).toEqual({ "x-api-key": "secret" });
	});

	it("turns a timeout into result:error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(
				Object.assign(new Error("timed out"), {
					name: "TimeoutError",
				}),
			),
		);
		const result = await getOnuStatus("iface", { timeoutMs: 1 });
		expect(result.result).toBe("error");
		expect(result.error).toBe("ONU lookup timed out");
	});

	it("reports a rejected key", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
		);
		const result = await getOnuStatus("iface", { timeoutMs: 1000 });
		expect(result.result).toBe("error");
		expect(result.error).toBe("ONU service rejected the API key");
	});

	it("is an error, not a throw, when unconfigured", async () => {
		vi.stubEnv("TG_ISP_BOT_URL", "");
		const result = await getOnuStatus("iface", { timeoutMs: 1000 });
		expect(result.result).toBe("error");
	});
});
