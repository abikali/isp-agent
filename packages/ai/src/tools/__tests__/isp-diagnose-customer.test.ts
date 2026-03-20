import { describe, expect, it } from "vitest";
import type { BandwidthDataPoint } from "../isp-bandwidth-stats";
import {
	analyzeBandwidth,
	analyzePing,
	analyzePingText,
	buildDiagnosis,
	interpretSignal,
} from "../isp-diagnose-customer";
import type { ParsedPingResult } from "../isp-ping-customer";

// ---------------------------------------------------------------------------
// analyzePing
// ---------------------------------------------------------------------------

describe("analyzePing", () => {
	it("returns unknown for null", () => {
		expect(analyzePing(null)).toEqual({
			status: "unknown",
			packetLossPercent: 0,
			latency: null,
		});
	});

	it("returns unreachable for 100% loss", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 0,
			packetLossPercent: 100,
			rttMin: null,
			rttAvg: null,
			rttMax: null,
			summary: "",
		};
		expect(analyzePing(parsed)).toEqual({
			status: "unreachable",
			packetLossPercent: 100,
			latency: null,
		});
	});

	it("returns healthy with low latency for 0% loss and low RTT", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 2,
			rttAvg: 5,
			rttMax: 10,
			summary: "",
		};
		expect(analyzePing(parsed)).toEqual({
			status: "healthy",
			packetLossPercent: 0,
			latency: "low",
		});
	});

	it("returns healthy with moderate latency for 0% loss and mid RTT", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 20,
			rttAvg: 35,
			rttMax: 50,
			summary: "",
		};
		expect(analyzePing(parsed)).toEqual({
			status: "healthy",
			packetLossPercent: 0,
			latency: "moderate",
		});
	});

	it("returns healthy with high latency for 0% loss and high RTT", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 50,
			rttAvg: 80,
			rttMax: 120,
			summary: "",
		};
		expect(analyzePing(parsed)).toEqual({
			status: "healthy",
			packetLossPercent: 0,
			latency: "high",
		});
	});

	it("returns unstable for partial loss", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 14,
			packetLossPercent: 30,
			rttMin: 5,
			rttAvg: 15,
			rttMax: 50,
			summary: "",
		};
		expect(analyzePing(parsed)).toEqual({
			status: "unstable",
			packetLossPercent: 30,
			latency: null,
		});
	});
});

// ---------------------------------------------------------------------------
// analyzePingText (used for neighbor check display)
// ---------------------------------------------------------------------------

describe("analyzePingText", () => {
	it("returns text format for null", () => {
		expect(analyzePingText(null)).toBe("No ping data");
	});

	it("returns text format for 100% loss", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 0,
			packetLossPercent: 100,
			rttMin: null,
			rttAvg: null,
			rttMax: null,
			summary: "",
		};
		expect(analyzePingText(parsed)).toBe("Unreachable (100% packet loss)");
	});

	it("returns text format for healthy ping", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 2,
			rttAvg: 5,
			rttMax: 10,
			summary: "",
		};
		expect(analyzePingText(parsed)).toBe("Healthy (0% loss, low latency)");
	});
});

// ---------------------------------------------------------------------------
// analyzeBandwidth
// ---------------------------------------------------------------------------

describe("analyzeBandwidth", () => {
	it("returns null for null input", () => {
		expect(analyzeBandwidth(null)).toBeNull();
	});

	it("returns null for empty array", () => {
		expect(analyzeBandwidth([])).toBeNull();
	});

	it("returns idle for low usage", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 500,
				currentDown: 1000,
			},
		];
		expect(analyzeBandwidth(stats)).toEqual({
			status: "idle",
			usagePercent: 2,
		});
	});

	it("returns idle for 50% usage", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 5000,
				currentDown: 25000,
			},
		];
		expect(analyzeBandwidth(stats)).toEqual({
			status: "idle",
			usagePercent: 50,
		});
	});

	it("returns saturated for 90% usage", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 9000,
				currentDown: 45000,
			},
		];
		expect(analyzeBandwidth(stats)).toEqual({
			status: "saturated",
			usagePercent: 90,
		});
	});

	it("uses the last data point", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 100,
				currentDown: 100,
			},
			{
				date: "2025-01-02",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 9000,
				currentDown: 48000,
			},
		];
		expect(analyzeBandwidth(stats)).toEqual({
			status: "saturated",
			usagePercent: 96,
		});
	});
});

// ---------------------------------------------------------------------------
// interpretSignal
// ---------------------------------------------------------------------------

describe("interpretSignal", () => {
	it("returns excellent for strong signal", () => {
		expect(interpretSignal(-55)).toEqual({
			dbm: -55,
			quality: "excellent",
		});
	});

	it("returns good for moderate signal", () => {
		expect(interpretSignal(-65)).toEqual({ dbm: -65, quality: "good" });
	});

	it("returns fair for weak signal", () => {
		expect(interpretSignal(-75)).toEqual({ dbm: -75, quality: "fair" });
	});

	it("returns poor for very weak signal", () => {
		expect(interpretSignal(-85)).toEqual({ dbm: -85, quality: "poor" });
	});

	it("returns excellent at boundary -60", () => {
		expect(interpretSignal(-60)).toEqual({
			dbm: -60,
			quality: "excellent",
		});
	});

	it("returns good at boundary -70", () => {
		expect(interpretSignal(-70)).toEqual({ dbm: -70, quality: "good" });
	});

	it("returns fair at boundary -80", () => {
		expect(interpretSignal(-80)).toEqual({ dbm: -80, quality: "fair" });
	});
});

// ---------------------------------------------------------------------------
// buildDiagnosis
// ---------------------------------------------------------------------------

describe("buildDiagnosis", () => {
	const baseInput = {
		accountActive: true,
		online: true,
		fupMode: "0",
		accessPointOnline: true as boolean | null,
		stationOnline: true as boolean | null,
		connectionType: "wireless" as const,
		pingStatus: "healthy" as const,
		bandwidthStatus: "idle" as const,
		neighborResults: [] as Array<{ userName: string; ping: string }>,
	};

	it("diagnoses BLOCKED account with account-issue severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "BLOCKED",
			accountActive: false,
		});
		expect(result.severity).toBe("account-issue");
		expect(result.diagnosis).toContain("blocked");
		expect(result.actionNeeded).toContain("resolve the block");
	});

	it("diagnoses EXPIRED account with account-issue severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "EXPIRED",
			accountActive: false,
		});
		expect(result.severity).toBe("account-issue");
		expect(result.diagnosis).toContain("expired");
		expect(result.actionNeeded).toContain("Renew");
	});

	it("diagnoses DISABLED account with account-issue severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "DISABLED",
			accountActive: false,
		});
		expect(result.severity).toBe("account-issue");
		expect(result.diagnosis).toContain("disabled");
		expect(result.actionNeeded).toContain("reactivate");
	});

	it("diagnoses FUP while online with degraded severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			fupMode: "1",
		});
		expect(result.severity).toBe("degraded");
		expect(result.diagnosis).toContain("Fair Usage Policy");
		expect(result.actionNeeded).toContain("quota");
	});

	it("diagnoses offline with AP down with down severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			accessPointOnline: false,
			pingStatus: "unreachable",
		});
		expect(result.severity).toBe("down");
		expect(result.diagnosis).toContain("disconnected");
		expect(result.diagnosis).toContain("access point");
		expect(result.actionNeeded).toContain("plugged in");
	});

	it("diagnoses offline with station down", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			accessPointOnline: true,
			stationOnline: false,
			pingStatus: "unreachable",
		});
		expect(result.severity).toBe("down");
		expect(result.diagnosis).toContain("disconnected");
		expect(result.diagnosis).toContain("station");
		expect(result.actionNeeded).toContain("infrastructure");
	});

	it("diagnoses offline with all neighbors also unreachable", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			pingStatus: "unreachable",
			neighborResults: [
				{
					userName: "peer1",
					ping: "Unreachable (100% packet loss)",
				},
				{
					userName: "peer2",
					ping: "Unreachable (100% packet loss)",
				},
			],
		});
		expect(result.severity).toBe("down");
		expect(result.diagnosis).toContain("infrastructure issue");
	});

	it("diagnoses offline with neighbors online (isolated issue)", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			pingStatus: "unreachable",
			neighborResults: [
				{
					userName: "peer1",
					ping: "Healthy (0% loss, low latency)",
				},
			],
		});
		expect(result.severity).toBe("down");
		expect(result.diagnosis).toContain("isolated");
	});

	it("diagnoses online with saturated bandwidth with degraded severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			bandwidthStatus: "saturated",
		});
		expect(result.severity).toBe("degraded");
		expect(result.diagnosis).toContain("saturated");
		expect(result.actionNeeded).toContain("bandwidth");
	});

	it("diagnoses online + healthy as ok severity", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
		});
		expect(result.severity).toBe("ok");
		expect(result.diagnosis).toContain("healthy");
		expect(result.actionNeeded).toContain("speed test");
	});

	it("notes FUP as secondary when offline", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			fupMode: "1",
			pingStatus: "unreachable",
		});
		expect(result.severity).toBe("down");
		expect(result.diagnosis).toContain("disconnected");
		expect(result.diagnosis).toContain("FUP");
		expect(result.diagnosis).toContain("NOT the cause");
	});
});
