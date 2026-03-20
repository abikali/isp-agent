/**
 * Smoke tests for isp-diagnose-customer tool.
 *
 * These test the analysis functions with realistic ISP API-shaped data,
 * covering edge cases that the model must handle correctly:
 * - FUP diagnosis (no unnecessary diagnostics)
 * - Dedicated connection (no peers to check)
 * - Neighbor claims with no peer data
 * - Offline with equipment down
 * - Online + saturated bandwidth
 * - Multiple matches requiring disambiguation
 * - Blocked / expired / disabled accounts
 */
import { describe, expect, it } from "vitest";
import type { BandwidthDataPoint } from "../isp-bandwidth-stats";
import {
	analyzeBandwidth,
	analyzePing,
	buildDiagnosis,
	interpretSignal,
} from "../isp-diagnose-customer";
import type { ParsedPingResult } from "../isp-ping-customer";

// ---------------------------------------------------------------------------
// Scenario: FUP customer on dedicated wireless connection
// (The exact scenario that failed in production)
// ---------------------------------------------------------------------------

describe("FUP on dedicated wireless connection", () => {
	const fupDiagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: true,
		fupMode: "1",
		accessPointOnline: true,
		stationOnline: true,
		connectionType: "wireless",
		pingStatus: "unknown",
		bandwidthStatus: null,
		neighborResults: [],
	});

	it("diagnoses FUP as the cause", () => {
		expect(fupDiagnosis.diagnosis).toContain("Fair Usage Policy");
	});

	it("has degraded severity", () => {
		expect(fupDiagnosis.severity).toBe("degraded");
	});

	it("does NOT mention neighbors or infrastructure", () => {
		expect(fupDiagnosis.diagnosis).not.toContain("neighbor");
		expect(fupDiagnosis.diagnosis).not.toContain("infrastructure");
		expect(fupDiagnosis.diagnosis).not.toContain("isolated");
	});

	it("suggests waiting for quota reset or upgrading", () => {
		expect(fupDiagnosis.actionNeeded).toContain("quota");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Offline customer, AP down, FUP also active
// (FUP is secondary — offline + AP down is the real issue)
// ---------------------------------------------------------------------------

describe("offline with AP down + FUP active", () => {
	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: false,
		fupMode: "1",
		accessPointOnline: false,
		stationOnline: true,
		connectionType: "wireless",
		pingStatus: "unreachable",
		bandwidthStatus: null,
		neighborResults: [],
	});

	it("leads with disconnection, not FUP", () => {
		expect(diagnosis.diagnosis).toMatch(/disconnected/i);
	});

	it("has down severity", () => {
		expect(diagnosis.severity).toBe("down");
	});

	it("mentions AP is powered off", () => {
		expect(diagnosis.diagnosis).toContain("access point");
	});

	it("mentions FUP as secondary context", () => {
		expect(diagnosis.diagnosis).toContain("FUP");
		expect(diagnosis.diagnosis).toContain("NOT the cause");
	});

	it("tells customer to check equipment", () => {
		expect(diagnosis.actionNeeded).toContain("plugged in");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Offline, station down, all neighbors also unreachable
// (Infrastructure issue — not isolated to customer)
// ---------------------------------------------------------------------------

describe("offline with station down + all neighbors unreachable", () => {
	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: false,
		fupMode: "0",
		accessPointOnline: true,
		stationOnline: false,
		connectionType: "fiber",
		pingStatus: "unreachable",
		bandwidthStatus: null,
		neighborResults: [
			{ userName: "peer1", ping: "Unreachable (100% packet loss)" },
			{ userName: "peer2", ping: "Unreachable (100% packet loss)" },
		],
	});

	it("identifies infrastructure issue", () => {
		expect(diagnosis.diagnosis).toContain("infrastructure");
	});

	it("mentions station is down", () => {
		expect(diagnosis.diagnosis).toContain("station");
	});

	it("suggests ISP is likely aware", () => {
		expect(diagnosis.actionNeeded).toContain("infrastructure");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Offline but neighbors are healthy (isolated issue)
// ---------------------------------------------------------------------------

describe("offline with healthy neighbors (isolated)", () => {
	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: false,
		fupMode: "0",
		accessPointOnline: true,
		stationOnline: true,
		connectionType: "wireless",
		pingStatus: "unreachable",
		bandwidthStatus: null,
		neighborResults: [
			{ userName: "peer1", ping: "Healthy (0% loss, low latency)" },
		],
	});

	it("identifies isolated issue", () => {
		expect(diagnosis.diagnosis).toContain("isolated");
	});

	it("suggests restarting equipment", () => {
		expect(diagnosis.actionNeeded).toContain("restart");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Online + bandwidth saturated
// ---------------------------------------------------------------------------

describe("online with saturated bandwidth", () => {
	const bw: BandwidthDataPoint[] = [
		{
			date: "2025-01-01",
			limitUp: 10000,
			limitDown: 50000,
			currentUp: 9000,
			currentDown: 46000,
		},
	];

	const bwAnalysis = analyzeBandwidth(bw);

	it("detects saturation", () => {
		expect(bwAnalysis).toEqual({ status: "saturated", usagePercent: 92 });
	});

	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: true,
		fupMode: "0",
		accessPointOnline: true,
		stationOnline: true,
		connectionType: "wired",
		pingStatus: "healthy",
		bandwidthStatus: "saturated",
		neighborResults: [],
	});

	it("mentions bandwidth saturation in diagnosis", () => {
		expect(diagnosis.diagnosis).toContain("saturated");
	});

	it("has degraded severity", () => {
		expect(diagnosis.severity).toBe("degraded");
	});

	it("suggests checking devices using bandwidth", () => {
		expect(diagnosis.actionNeeded).toContain("bandwidth");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Online + healthy + idle bandwidth (inconclusive)
// ---------------------------------------------------------------------------

describe("online + healthy + idle bandwidth", () => {
	const bw: BandwidthDataPoint[] = [
		{
			date: "2025-01-01",
			limitUp: 10000,
			limitDown: 50000,
			currentUp: 100,
			currentDown: 500,
		},
	];

	const bwAnalysis = analyzeBandwidth(bw);

	it("reports idle, not broken", () => {
		expect(bwAnalysis).toEqual({ status: "idle", usagePercent: 1 });
	});

	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: true,
		fupMode: "0",
		accessPointOnline: true,
		stationOnline: true,
		connectionType: "wired",
		pingStatus: "healthy",
		bandwidthStatus: "idle",
		neighborResults: [
			{ userName: "peer1", ping: "Healthy (0% loss, low latency)" },
		],
	});

	it("reports connection as healthy", () => {
		expect(diagnosis.diagnosis).toContain("healthy");
	});

	it("has ok severity", () => {
		expect(diagnosis.severity).toBe("ok");
	});

	it("suggests speed test", () => {
		expect(diagnosis.actionNeeded).toContain("speed test");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Zero bandwidth (0%) — should NOT mean broken
// ---------------------------------------------------------------------------

describe("zero bandwidth does not mean broken", () => {
	const bw: BandwidthDataPoint[] = [
		{
			date: "2025-01-01",
			limitUp: 10000,
			limitDown: 50000,
			currentUp: 0,
			currentDown: 0,
		},
	];

	const bwAnalysis = analyzeBandwidth(bw);

	it("reports idle, not saturated", () => {
		expect(bwAnalysis).toEqual({ status: "idle", usagePercent: 0 });
	});
});

// ---------------------------------------------------------------------------
// Scenario: All account gate failures
// ---------------------------------------------------------------------------

describe("account gate failures", () => {
	const baseInput = {
		accountActive: false,
		online: false,
		fupMode: "0",
		accessPointOnline: null as boolean | null,
		stationOnline: null as boolean | null,
		connectionType: "wireless" as const,
		pingStatus: "unknown" as const,
		bandwidthStatus: null,
		neighborResults: [] as Array<{ userName: string; ping: string }>,
	};

	it("BLOCKED: mentions billing with account-issue severity", () => {
		const d = buildDiagnosis({ ...baseInput, accountStatus: "BLOCKED" });
		expect(d.severity).toBe("account-issue");
		expect(d.diagnosis).toContain("blocked");
		expect(d.diagnosis.toLowerCase()).toContain("unpaid");
	});

	it("EXPIRED: mentions subscription with account-issue severity", () => {
		const d = buildDiagnosis({ ...baseInput, accountStatus: "EXPIRED" });
		expect(d.severity).toBe("account-issue");
		expect(d.diagnosis).toContain("expired");
		expect(d.actionNeeded).toContain("Renew");
	});

	it("DISABLED: mentions disabled with account-issue severity", () => {
		const d = buildDiagnosis({ ...baseInput, accountStatus: "DISABLED" });
		expect(d.severity).toBe("account-issue");
		expect(d.diagnosis).toContain("disabled");
		expect(d.actionNeeded).toContain("reactivate");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Signal strength edge cases
// ---------------------------------------------------------------------------

describe("signal strength interpretation", () => {
	it("-50 is excellent", () => {
		expect(interpretSignal(-50)).toEqual({
			dbm: -50,
			quality: "excellent",
		});
	});

	it("-60 boundary is excellent", () => {
		expect(interpretSignal(-60)).toEqual({
			dbm: -60,
			quality: "excellent",
		});
	});

	it("-61 is good", () => {
		expect(interpretSignal(-61)).toEqual({ dbm: -61, quality: "good" });
	});

	it("-70 boundary is good", () => {
		expect(interpretSignal(-70)).toEqual({ dbm: -70, quality: "good" });
	});

	it("-71 is fair", () => {
		expect(interpretSignal(-71)).toEqual({ dbm: -71, quality: "fair" });
	});

	it("-80 boundary is fair", () => {
		expect(interpretSignal(-80)).toEqual({ dbm: -80, quality: "fair" });
	});

	it("-81 is poor", () => {
		expect(interpretSignal(-81)).toEqual({ dbm: -81, quality: "poor" });
	});

	it("-90 is poor", () => {
		expect(interpretSignal(-90)).toEqual({ dbm: -90, quality: "poor" });
	});
});

// ---------------------------------------------------------------------------
// Scenario: Unstable connection (partial packet loss)
// ---------------------------------------------------------------------------

describe("unstable connection", () => {
	const parsed: ParsedPingResult = {
		packetsSent: 20,
		packetsReceived: 12,
		packetLossPercent: 40,
		rttMin: 10,
		rttAvg: 45,
		rttMax: 200,
		summary: "",
	};

	it("reports as unstable", () => {
		expect(analyzePing(parsed)).toEqual({
			status: "unstable",
			packetLossPercent: 40,
			latency: null,
		});
	});

	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: true,
		fupMode: "0",
		accessPointOnline: true,
		stationOnline: true,
		connectionType: "wireless",
		pingStatus: "unstable",
		bandwidthStatus: "idle",
		neighborResults: [
			{ userName: "peer1", ping: "Healthy (0% loss, low latency)" },
		],
	});

	it("mentions instability in diagnosis", () => {
		expect(diagnosis.diagnosis).toContain("unstable");
	});

	it("has degraded severity", () => {
		expect(diagnosis.severity).toBe("degraded");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Online but ping unreachable (NAT/firewall)
// ---------------------------------------------------------------------------

describe("online but ping unreachable (NAT)", () => {
	const diagnosis = buildDiagnosis({
		accountStatus: "Active",
		accountActive: true,
		online: true,
		fupMode: "0",
		accessPointOnline: true,
		stationOnline: true,
		connectionType: "wired",
		pingStatus: "unreachable",
		bandwidthStatus: "idle",
		neighborResults: [],
	});

	it("mentions NAT/firewall possibility", () => {
		expect(diagnosis.diagnosis).toContain("NAT");
	});

	it("still suggests speed test", () => {
		expect(diagnosis.actionNeeded).toContain("speed test");
	});
});

// ---------------------------------------------------------------------------
// Scenario: Bandwidth with limitDown = 0 (no plan limit set)
// ---------------------------------------------------------------------------

describe("bandwidth with zero limit", () => {
	const bw: BandwidthDataPoint[] = [
		{
			date: "2025-01-01",
			limitUp: 0,
			limitDown: 0,
			currentUp: 5000,
			currentDown: 10000,
		},
	];

	it("reports idle (0% because limit is 0)", () => {
		const result = analyzeBandwidth(bw);
		expect(result).toEqual({ status: "idle", usagePercent: 0 });
	});
});

// ---------------------------------------------------------------------------
// Scenario: Multiple bandwidth data points — uses latest
// ---------------------------------------------------------------------------

describe("bandwidth uses latest data point", () => {
	const bw: BandwidthDataPoint[] = [
		{
			date: "2025-01-01T10:00",
			limitUp: 10000,
			limitDown: 50000,
			currentUp: 100,
			currentDown: 200,
		},
		{
			date: "2025-01-01T10:05",
			limitUp: 10000,
			limitDown: 50000,
			currentUp: 9500,
			currentDown: 47000,
		},
	];

	it("reports saturated based on latest point", () => {
		expect(analyzeBandwidth(bw)).toEqual({
			status: "saturated",
			usagePercent: 94,
		});
	});
});

// ---------------------------------------------------------------------------
// Scenario: Ping with 0% loss but null RTT (edge case)
// ---------------------------------------------------------------------------

describe("ping with 0% loss but null avg RTT", () => {
	const parsed: ParsedPingResult = {
		packetsSent: 20,
		packetsReceived: 20,
		packetLossPercent: 0,
		rttMin: null,
		rttAvg: null,
		rttMax: null,
		summary: "",
	};

	it("reports healthy with low latency (null treated as 0)", () => {
		expect(analyzePing(parsed)).toEqual({
			status: "healthy",
			packetLossPercent: 0,
			latency: "low",
		});
	});
});
