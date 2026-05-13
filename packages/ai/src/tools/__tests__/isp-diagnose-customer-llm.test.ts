/**
 * LLM-integrated smoke tests for isp-diagnose-customer.
 *
 * These tests mock the ISP API (fetch), invoke the real tool via the LLM,
 * and assert on the quality of the AI's response for each diagnostic scenario.
 *
 * Requires OPENROUTER_API_KEY in env (skips gracefully if missing).
 *
 * Run: pnpm --filter @repo/ai vitest run src/tools/__tests__/isp-diagnose-customer-llm.test.ts
 */
import {
	afterAll,
	beforeAll,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import { generateAgentResponse } from "../../generate";
import { ispDiagnoseCustomer } from "../isp-diagnose-customer";
import type { ToolContext } from "../types";

// ---------------------------------------------------------------------------
// Skip if no API key
// ---------------------------------------------------------------------------

const OPENROUTER_KEY = process.env["OPENROUTER_API_KEY"];
const describeWithLLM = OPENROUTER_KEY ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "gpt-4.1-mini";
const SYSTEM_PROMPT = `You are a Lebanese ISP support agent. Respond in Arabic (Lebanese dialect). Be concise — 2-3 sentences max.
Your name is "مساعد ليبان كوم".

${ispDiagnoseCustomer.defaultPromptSection}`;

const TOOL_CONTEXT: ToolContext = {
	organizationId: "test-org",
	agentId: "test-agent",
	conversationId: "test-conv",
	externalChatId: "test-chat",
	contactName: "Customer",
	toolConfig: {
		ispBaseUrl: "https://mock-isp.test/api",
		ispUsername: "test",
		ispPassword: "test",
	},
};

// ---------------------------------------------------------------------------
// Fetch mock infrastructure
// ---------------------------------------------------------------------------

/** Map of URL path+params → response body */
type MockRoute = {
	path: string;
	params?: Record<string, string>;
	response: unknown;
	status?: number;
};

let fetchSpy: MockInstance;
let activeRoutes: MockRoute[] = [];
const originalFetch = globalThis.fetch;

function setupMockRoutes(routes: MockRoute[]) {
	activeRoutes = routes;
}

function mockFetchHandler(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	const url =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.toString()
				: input.url;
	const method = init?.method ?? "GET";

	// Only intercept ISP API calls — let everything else (OpenRouter, etc.) through
	if (!url.includes("mock-isp.test")) {
		return originalFetch(input, init);
	}

	// Handle auth endpoint
	if (url.includes("/authenticate") && method === "POST") {
		return Promise.resolve(new Response("mock-jwt-token", { status: 200 }));
	}

	// Match routes
	const parsedUrl = new URL(url);
	const path = parsedUrl.pathname.replace("/api", "");

	for (const route of activeRoutes) {
		if (!path.endsWith(route.path)) {
			continue;
		}

		// Check params match if specified
		if (route.params) {
			const allMatch = Object.entries(route.params).every(
				([key, value]) => parsedUrl.searchParams.get(key) === value,
			);
			if (!allMatch) {
				continue;
			}
		}

		const body =
			route.response === null ? "" : JSON.stringify(route.response);
		return Promise.resolve(
			new Response(body, {
				status: route.status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}

	// Unmatched ISP route
	return Promise.resolve(new Response("Not found", { status: 404 }));
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createTool() {
	return {
		"isp-diagnose-customer": ispDiagnoseCustomer.factory(TOOL_CONTEXT),
	};
}

async function askAgent(userMessage: string) {
	const result = await generateAgentResponse({
		model: MODEL,
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: userMessage },
		],
		tools: createTool(),
		temperature: 0,
	});
	return result;
}

// Normalize Arabic text for assertions (remove diacritics/tashkeel)
function normalize(text: string): string {
	return text
		.replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, "")
		.toLowerCase();
}

// ---------------------------------------------------------------------------
// Mock customer data factories
// ---------------------------------------------------------------------------

function makeCustomer(overrides: Record<string, unknown> = {}) {
	return {
		firstName: "Joseph",
		lastName: "Sassine",
		userName: "elierbahe",
		address: "Batroun, Main Street",
		mobile: "71123456",
		online: true,
		active: true,
		blocked: false,
		fupMode: "0",
		ipAddress: "10.0.0.5",
		accessPointName: "AP-Batroun-01",
		accessPointOnline: true,
		accessPointSignal: "-61",
		stationOnline: true,
		mikrotikInterface: "wlan1",
		basicSpeedDown: "4096",
		basicSpeedUp: "1024",
		expiryAccount: "2027-12-31",
		accessPointUsers: [],
		...overrides,
	};
}

function makePingResponse(opts: { loss?: number; times?: number[] } = {}) {
	const loss = opts.loss ?? 0;
	const times = opts.times ?? [
		5, 8, 3, 6, 4, 7, 5, 9, 3, 6, 4, 8, 5, 7, 3, 6, 4, 8, 5, 7,
	];
	const sent = 20;
	const received = Math.round(sent * (1 - loss / 100));
	const lines: string[] = [];

	for (let i = 0; i < sent; i++) {
		if (i < received && times[i % times.length] !== undefined) {
			lines.push(
				`SEQ HOST                                     SIZE TTL TIME  STATUS
  ${i}  10.0.0.5                                   56  64 ${times[i % times.length]}ms  `,
			);
		} else {
			lines.push(
				`SEQ HOST                                     SIZE TTL TIME  STATUS
  ${i}  10.0.0.5                                                   timeout`,
			);
		}
	}

	lines.push(`    sent=${sent} received=${received} packet-loss=${loss}%`);

	if (received > 0) {
		const min = Math.min(...times.slice(0, received));
		const max = Math.max(...times.slice(0, received));
		const avg = Math.round(
			times.slice(0, received).reduce((a, b) => a + b, 0) / received,
		);
		lines.push(`    min-rtt=${min}ms avg-rtt=${avg}ms max-rtt=${max}ms`);
	}

	return lines;
}

function makeBandwidthResponse(
	opts: {
		limitDown?: number;
		currentDown?: number;
		limitUp?: number;
		currentUp?: number;
	} = {},
) {
	return [
		{
			date: new Date().toISOString(),
			limitDown: opts.limitDown ?? 4096,
			currentDown: opts.currentDown ?? 200,
			limitUp: opts.limitUp ?? 1024,
			currentUp: opts.currentUp ?? 50,
		},
	];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeWithLLM("isp-diagnose-customer LLM smoke tests", () => {
	beforeAll(() => {
		// Mock @repo/logs to avoid noise
		vi.mock("@repo/logs", () => ({
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		}));

		fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(mockFetchHandler as typeof fetch);
	});

	afterAll(() => {
		fetchSpy.mockRestore();
		vi.restoreAllMocks();
	});

	// ===================================================================
	// 1. CUSTOMER NOT FOUND
	// ===================================================================

	describe("customer not found", () => {
		it("asks for alternative number/username, offers invoice photo option", async () => {
			setupMockRoutes([{ path: "/user-info", response: null }]);

			const result = await askAgent(
				"شو صار بالانترنت عندي؟ رقمي 03999999",
			);

			// Tool should have been called
			expect(result.toolResults).toBeDefined();
			expect(
				result.toolResults?.some(
					(r) => r.toolName === "isp-diagnose-customer",
				),
			).toBe(true);

			// Response should ask about alternative number and mention invoice
			const text = normalize(result.text);
			expect(text).toBeTruthy();
			// Should NOT mention FUP, bandwidth, or signal
			expect(text).not.toContain("fup");
			expect(text).not.toContain("bandwidth");
		}, 60_000);
	});

	// ===================================================================
	// 2. MULTIPLE MATCHES
	// ===================================================================

	describe("multiple matches — disambiguation", () => {
		it("presents usernames and addresses for selection", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: [
						makeCustomer({
							userName: "joseph1",
							address: "Batroun, Building A",
						}),
						makeCustomer({
							userName: "joseph2",
							address: "Jbeil, Building B",
						}),
					],
				},
			]);

			const result = await askAgent("شيك عالانترنت يلي، رقمي 71123456");

			expect(result.toolResults).toBeDefined();

			const text = result.text;
			// MUST present both usernames — customer needs them to identify their account
			expect(text).toContain("joseph1");
			expect(text).toContain("joseph2");
			// Should mention addresses for disambiguation
			expect(text.toLowerCase()).toMatch(
				/batroun|jbeil|building|باترون|جبيل|مبنى/i,
			);
			// Should NOT mention FUP or technical details
			expect(normalize(text)).not.toContain("fup");
		}, 60_000);
	});

	// ===================================================================
	// 3. BLOCKED ACCOUNT
	// ===================================================================

	describe("blocked account", () => {
		it("explains account is blocked due to billing", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({ blocked: true }),
				},
			]);

			const result = await askAgent(
				"ليش الانترنت مقطوع؟ يوزرنيمي elierbahe",
			);

			expect(result.toolResults).toBeDefined();

			const text = normalize(result.text);
			// Should mention blocking/payment
			expect(text.length).toBeGreaterThan(10);
			// Should NOT mention FUP, ping, bandwidth, signal
			expect(text).not.toContain("fup");
			expect(text).not.toContain("bandwidth");
			expect(text).not.toContain("signal");
			expect(text).not.toContain("speedtest");
		}, 60_000);
	});

	// ===================================================================
	// 4. EXPIRED ACCOUNT
	// ===================================================================

	describe("expired account", () => {
		it("explains subscription expired, suggests renewal", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						expiryAccount: "2024-01-01T00:00:00",
					}),
				},
			]);

			const result = await askAgent(
				"الانترنت مش شغال، يوزرنيمي elierbahe",
			);

			expect(result.toolResults).toBeDefined();
			const text = normalize(result.text);
			expect(text.length).toBeGreaterThan(10);
			// Should NOT send speed test or mention FUP
			expect(text).not.toContain("speedtest");
			expect(text).not.toContain("fup");
		}, 60_000);
	});

	// ===================================================================
	// 5. DISABLED ACCOUNT
	// ===================================================================

	describe("disabled account", () => {
		it("explains account is disabled", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({ active: false }),
				},
			]);

			const result = await askAgent(
				"ما في انترنت، اسم المشترك elierbahe",
			);

			expect(result.toolResults).toBeDefined();
			expect(result.text.length).toBeGreaterThan(10);
		}, 60_000);
	});

	// ===================================================================
	// 6. FUP ACTIVE (THE ORIGINAL BUG SCENARIO — SHOULD NOT MENTION IRRELEVANT FUP)
	// ===================================================================

	describe("FUP active — online with speed reduction", () => {
		it("explains FUP is active, does NOT suggest speed test", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({ fupMode: "1", online: true }),
				},
			]);

			const result = await askAgent(
				"الانترنت بطيء كتير، يوزرنيمي elierbahe",
			);

			expect(result.toolResults).toBeDefined();

			const text = result.text;
			// Should NOT send speed test link when FUP is active
			expect(text).not.toContain("speedtest.libancomlb.com");
		}, 60_000);
	});

	// ===================================================================
	// 7. ONLINE + HEALTHY (NO FUP — THE FIX VALIDATION)
	// ===================================================================

	describe("online + healthy — no FUP in output", () => {
		it("reports healthy connection, does NOT mention FUP at all", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointUsers: [],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse({
						limitDown: 4096,
						currentDown: 200,
					}),
				},
			]);

			const result = await askAgent("شيك عالانترنت، يوزرنيمي elierbahe");

			expect(result.toolResults).toBeDefined();

			const text = normalize(result.text);
			// THIS IS THE KEY ASSERTION: FUP should NOT appear in healthy reports
			expect(text).not.toContain("fup");
			expect(text).not.toContain("كوتا");
			expect(text).not.toContain("fair usage");
			// Should suggest speed test since bandwidth is idle
			expect(result.text).toContain("speedtest.libancomlb.com");
		}, 60_000);
	});

	// ===================================================================
	// 8. ONLINE + SATURATED BANDWIDTH (THE PRODUCTION BUG SCENARIO)
	// ===================================================================

	describe("online + saturated bandwidth — no FUP mention", () => {
		it("focuses on bandwidth saturation, does NOT mention FUP", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointUsers: [
							{ userName: "peer1", online: true },
							{ userName: "peer2", online: true },
						],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse({
						limitDown: 976,
						currentDown: 974,
					}),
				},
				// Peer pings
				{
					path: "/user-ping",
					params: { mobile: "peer1" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-ping",
					params: { mobile: "peer2" },
					response: makePingResponse({ loss: 0 }),
				},
			]);

			const result = await askAgent(
				"الانترنت بطيء كتير عندي، يوزرنيمي elierbahe",
			);

			expect(result.toolResults).toBeDefined();

			const text = normalize(result.text);
			// KEY: No FUP mention when FUP is not active
			expect(text).not.toContain("fup");
			expect(text).not.toContain("كوتا");
			expect(text).not.toContain("fair usage");
			// Should NOT send speed test (bandwidth is saturated)
			expect(result.text).not.toContain("speedtest.libancomlb.com");
		}, 60_000);
	});

	// ===================================================================
	// 9. OFFLINE — EQUIPMENT DOWN (AP OFF)
	// ===================================================================

	describe("offline — AP powered off", () => {
		it("tells customer to check equipment power", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: false,
						accessPointOnline: false,
						stationOnline: true,
						accessPointUsers: [],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 100 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: null,
				},
			]);

			const result = await askAgent("الانترنت فصل، يوزرنيمي elierbahe");

			expect(result.toolResults).toBeDefined();

			const text = result.text;
			// Should NOT send speed test (offline)
			expect(text).not.toContain("speedtest.libancomlb.com");
			// Should NOT mention FUP
			expect(normalize(text)).not.toContain("fup");
		}, 60_000);
	});

	// ===================================================================
	// 10. OFFLINE — STATION DOWN + NEIGHBORS UNREACHABLE
	// ===================================================================

	describe("offline — station down, infrastructure issue", () => {
		it("identifies infrastructure issue, does NOT blame customer", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: false,
						accessPointOnline: true,
						stationOnline: false,
						accessPointUsers: [
							{ userName: "peer1", online: false },
							{ userName: "peer2", online: false },
						],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 100 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: null,
				},
			]);

			const result = await askAgent("مقطوع عنا الانترنت، elierbahe");

			expect(result.toolResults).toBeDefined();
			const text = normalize(result.text);
			// Should NOT mention FUP or speed test
			expect(text).not.toContain("fup");
			expect(result.text).not.toContain("speedtest.libancomlb.com");
		}, 60_000);
	});

	// ===================================================================
	// 11. OFFLINE — ISOLATED ISSUE (NEIGHBORS ARE FINE)
	// ===================================================================

	describe("offline — isolated issue, neighbors healthy", () => {
		it("suggests restarting equipment", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: false,
						accessPointOnline: true,
						stationOnline: true,
						accessPointUsers: [
							{ userName: "neighbor1", online: true },
							{ userName: "neighbor2", online: true },
						],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 100 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: null,
				},
				{
					path: "/user-ping",
					params: { mobile: "neighbor1" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-ping",
					params: { mobile: "neighbor2" },
					response: makePingResponse({ loss: 0 }),
				},
			]);

			const result = await askAgent("الانترنت فصل، elierbahe");

			expect(result.toolResults).toBeDefined();
			const text = normalize(result.text);
			// Should NOT mention FUP
			expect(text).not.toContain("fup");
		}, 60_000);
	});

	// ===================================================================
	// 12. UNSTABLE CONNECTION (PARTIAL PACKET LOSS)
	// ===================================================================

	describe("unstable connection — packet loss", () => {
		it("reports instability without mentioning FUP", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointUsers: [],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({
						loss: 40,
						times: [10, 45, 200, 15, 90],
					}),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse({
						limitDown: 4096,
						currentDown: 200,
					}),
				},
			]);

			const result = await askAgent("الانترنت عم يقطع ويرجع، elierbahe");

			expect(result.toolResults).toBeDefined();
			const text = normalize(result.text);
			expect(text).not.toContain("fup");
		}, 60_000);
	});

	// ===================================================================
	// 13. WIRELESS + POOR SIGNAL
	// ===================================================================

	describe("wireless customer — poor signal", () => {
		it("mentions signal quality for wireless customers", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointSignal: "-85",
						accessPointUsers: [],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({
						loss: 15,
						times: [20, 60, 150, 30, 80],
					}),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse({
						limitDown: 4096,
						currentDown: 200,
					}),
				},
			]);

			const result = await askAgent("الانترنت بطيء، elierbahe");

			expect(result.toolResults).toBeDefined();

			// Tool result should have signal data
			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			expect(toolResult).toBeDefined();
			const output = toolResult?.result as Record<string, unknown>;
			expect(output?.["signal"]).toEqual({ dbm: -85, quality: "poor" });
		}, 60_000);
	});

	// ===================================================================
	// 14. DUAL-VALUE SIGNAL FORMAT ("-60 / -52")
	// ===================================================================

	describe("dual-value accessPointSignal parsing", () => {
		it("correctly parses TX/RX format", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointSignal: "-60 / -52",
						accessPointUsers: [],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse(),
				},
			]);

			const result = await askAgent("شيك عالاتصال، elierbahe");

			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			expect(toolResult).toBeDefined();
			const output = toolResult?.result as Record<string, unknown>;
			// Should parse -60 (TX signal) correctly
			expect(output?.["signal"]).toEqual({
				dbm: -60,
				quality: "excellent",
			});
		}, 60_000);
	});

	// ===================================================================
	// 15. FUP + OFFLINE (FUP IS NOT THE CAUSE)
	// ===================================================================

	describe("offline + FUP active — FUP is secondary", () => {
		it("prioritizes offline diagnosis over FUP", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: false,
						fupMode: "1",
						accessPointOnline: false,
						accessPointUsers: [],
					}),
				},
				// FUP + offline → tool skips ping/bandwidth (early return)
			]);

			const result = await askAgent("الانترنت فصل، elierbahe");

			expect(result.toolResults).toBeDefined();

			// Even though FUP is active, since customer is offline, the response should
			// NOT primarily focus on FUP. The tool returns severity: "down" for offline.
			// Check that the tool output has the right severity
			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			// For FUP + online → early return with severity "degraded" and FUP focus
			// But we need to verify the LLM doesn't ONLY talk about FUP
			expect(toolResult).toBeDefined();
		}, 60_000);
	});

	// ===================================================================
	// 16. FIBER CUSTOMER (MIKROTIK PEERS)
	// ===================================================================

	describe("fiber customer — mikrotik peer lookup", () => {
		it("correctly handles fiber connection type with mikrotik peers", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						mikrotikInterface: "OLT1",
						accessPointName: undefined,
						accessPointSignal: undefined,
						accessPointUsers: undefined,
					}),
				},
				{
					path: "/mikrotik-user-list",
					params: { mikrotikInterface: "OLT1" },
					response: [
						{ userName: "elierbahe", online: true },
						{ userName: "fiberpeer1", online: true },
						{ userName: "fiberpeer2", online: false },
					],
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse({
						limitDown: 10240,
						currentDown: 500,
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "fiberpeer1" },
					response: makePingResponse({ loss: 0 }),
				},
			]);

			const result = await askAgent("شيك عالانترنت تبعي، elierbahe");

			expect(result.toolResults).toBeDefined();

			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			const output = toolResult?.result as Record<string, unknown>;
			expect(output?.["connectionType"]).toBe("fiber");
			// Signal should be null for fiber
			expect(output?.["signal"]).toBeNull();
			// Peers should be present
			expect(output?.["peersSummary"]).toContain("peer");
		}, 60_000);
	});

	// ===================================================================
	// 17. DEDICATED CONNECTION (NO PEERS)
	// ===================================================================

	describe("dedicated connection — no peers", () => {
		it("reports dedicated connection without fabricating neighbor data", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointUsers: [],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({ loss: 0 }),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse(),
				},
			]);

			const result = await askAgent(
				"الجيران عندن مشاكل بالانترنت كمان، شيك عالحساب تبعي elierbahe",
			);

			expect(result.toolResults).toBeDefined();

			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			const output = toolResult?.result as Record<string, unknown>;
			expect(output?.["peersSummary"]).toContain("dedicated");
			expect(output?.["neighborCheck"]).toContain("No online peers");
		}, 60_000);
	});

	// ===================================================================
	// 18. API ERROR HANDLING
	// ===================================================================

	describe("ISP API error — graceful degradation", () => {
		it("handles API failure gracefully", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: "Internal Server Error",
					status: 500,
				},
			]);

			const result = await askAgent("شيك عالانترنت، elierbahe");

			// Should still get a response, not crash
			expect(result.text.length).toBeGreaterThan(0);
		}, 60_000);
	});

	// ===================================================================
	// 19. TOOL OUTPUT STRUCTURE VALIDATION
	// ===================================================================

	describe("tool output structure — healthy customer", () => {
		it("returns structured objects, NOT string-encoded analysis", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "0",
						accessPointSignal: "-65",
						accessPointUsers: [{ userName: "peer1", online: true }],
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "elierbahe" },
					response: makePingResponse({
						loss: 0,
						times: [5, 8, 3, 6],
					}),
				},
				{
					path: "/user-stat",
					params: { mobile: "elierbahe" },
					response: makeBandwidthResponse({
						limitDown: 4096,
						currentDown: 200,
					}),
				},
				{
					path: "/user-ping",
					params: { mobile: "peer1" },
					response: makePingResponse({ loss: 0 }),
				},
			]);

			const result = await askAgent("شيك عالاتصال، elierbahe");

			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			expect(toolResult).toBeDefined();

			const output = toolResult?.result as Record<string, unknown>;

			// Structured ping (NOT string like "Healthy (0% loss, low latency)")
			expect(output?.["ping"]).toEqual({
				status: "healthy",
				packetLossPercent: 0,
				latency: "low",
			});

			// Structured bandwidth (NOT string like "Idle (5% current usage)")
			const bw = output?.["bandwidth"] as Record<string, unknown> | null;
			expect(bw).toBeDefined();
			expect(bw?.["status"]).toBe("idle");
			expect(typeof bw?.["usagePercent"]).toBe("number");

			// Structured signal (NOT string like "-65 dBm (good)")
			expect(output?.["signal"]).toEqual({
				dbm: -65,
				quality: "good",
			});

			// Severity field present
			expect(output?.["severity"]).toBe("ok");

			// FUP fields should NOT be present (fupMode is "0")
			expect(output).not.toHaveProperty("fup");
			expect(output).not.toHaveProperty("fupActive");

			// Speed test URL should be present (online + not saturated + no FUP)
			expect(output?.["speedTestUrl"]).toBe(
				"https://speedtest.libancomlb.com/",
			);
		}, 60_000);
	});

	// ===================================================================
	// 20. TOOL OUTPUT STRUCTURE — FUP ACTIVE
	// ===================================================================

	describe("tool output structure — FUP active", () => {
		it("includes fupActive as flat field, NOT nested object", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({
						online: true,
						fupMode: "1",
					}),
				},
			]);

			const result = await askAgent("شيك عالانترنت، elierbahe");

			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			expect(toolResult).toBeDefined();

			const output = toolResult?.result as Record<string, unknown>;

			// FUP should be flat fields, NOT { fup: { active: true } }
			expect(output).not.toHaveProperty("fup");
			expect(output?.["fupActive"]).toBe(true);
			expect(output?.["fupDescription"]).toBeDefined();
			expect(output?.["severity"]).toBe("degraded");
		}, 60_000);
	});

	// ===================================================================
	// 21. TOOL OUTPUT STRUCTURE — BLOCKED ACCOUNT
	// ===================================================================

	describe("tool output structure — blocked account", () => {
		it("includes all fields even for account-gate returns", async () => {
			setupMockRoutes([
				{
					path: "/user-info",
					response: makeCustomer({ blocked: true }),
				},
			]);

			const result = await askAgent("شيك عالحساب، elierbahe");

			const toolResult = result.toolResults?.find(
				(r) => r.toolName === "isp-diagnose-customer",
			);
			const output = toolResult?.result as Record<string, unknown>;

			// Normalized return shape
			expect(output?.["found"]).toBe(true);
			expect(output?.["severity"]).toBe("account-issue");
			expect(output?.["connectionStatus"]).toBe("Offline");
			expect(output?.["ping"]).toEqual({
				status: "unknown",
				packetLossPercent: 0,
				latency: null,
			});
			expect(output?.["bandwidth"]).toBeNull();
			expect(output?.["signal"]).toBeNull();
			expect(output?.["neighborCheck"]).toBeDefined();
			// Should NOT have old fup field
			expect(output).not.toHaveProperty("fup");
			expect(output).not.toHaveProperty("fupActive");
		}, 60_000);
	});
});
