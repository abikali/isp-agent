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
// analyzePing
// ---------------------------------------------------------------------------

describe("analyzePing", () => {
	it("returns 'No ping data' for null", () => {
		expect(analyzePing(null)).toBe("No ping data");
	});

	it("returns 'Unreachable' for 100% loss", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 0,
			packetLossPercent: 100,
			rttMin: null,
			rttAvg: null,
			rttMax: null,
			summary: "",
		};
		expect(analyzePing(parsed)).toBe("Unreachable (100% packet loss)");
	});

	it("returns 'Healthy' with low latency for 0% loss and low RTT", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 2,
			rttAvg: 5,
			rttMax: 10,
			summary: "",
		};
		expect(analyzePing(parsed)).toBe("Healthy (0% loss, low latency)");
	});

	it("returns 'Healthy' with moderate latency for 0% loss and mid RTT", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 20,
			rttAvg: 35,
			rttMax: 50,
			summary: "",
		};
		expect(analyzePing(parsed)).toBe("Healthy (0% loss, moderate latency)");
	});

	it("returns 'Healthy' with high latency for 0% loss and high RTT", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 20,
			packetLossPercent: 0,
			rttMin: 50,
			rttAvg: 80,
			rttMax: 120,
			summary: "",
		};
		expect(analyzePing(parsed)).toBe("Healthy (0% loss, high latency)");
	});

	it("returns 'Unstable' for partial loss", () => {
		const parsed: ParsedPingResult = {
			packetsSent: 20,
			packetsReceived: 14,
			packetLossPercent: 30,
			rttMin: 5,
			rttAvg: 15,
			rttMax: 50,
			summary: "",
		};
		expect(analyzePing(parsed)).toBe("Unstable (30% packet loss)");
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

	it("returns 'Idle' for low usage", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 500,
				currentDown: 1000,
			},
		];
		expect(analyzeBandwidth(stats)).toBe(
			"Idle (2% current usage — inconclusive)",
		);
	});

	it("returns 'Idle' for 50% usage", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 5000,
				currentDown: 25000,
			},
		];
		expect(analyzeBandwidth(stats)).toBe(
			"Idle (50% current usage — inconclusive)",
		);
	});

	it("returns 'Saturated' for 90% usage", () => {
		const stats: BandwidthDataPoint[] = [
			{
				date: "2025-01-01",
				limitUp: 10000,
				limitDown: 50000,
				currentUp: 9000,
				currentDown: 45000,
			},
		];
		expect(analyzeBandwidth(stats)).toBe(
			"Saturated (90% of plan limit in use)",
		);
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
		expect(analyzeBandwidth(stats)).toBe(
			"Saturated (96% of plan limit in use)",
		);
	});
});

// ---------------------------------------------------------------------------
// interpretSignal
// ---------------------------------------------------------------------------

describe("interpretSignal", () => {
	it("returns excellent for strong signal", () => {
		expect(interpretSignal(-55)).toBe("-55 dBm (excellent)");
	});

	it("returns good for moderate signal", () => {
		expect(interpretSignal(-65)).toBe("-65 dBm (good)");
	});

	it("returns fair for weak signal", () => {
		expect(interpretSignal(-75)).toBe("-75 dBm (fair)");
	});

	it("returns poor for very weak signal", () => {
		expect(interpretSignal(-85)).toBe("-85 dBm (poor)");
	});

	it("returns excellent at boundary -60", () => {
		expect(interpretSignal(-60)).toBe("-60 dBm (excellent)");
	});

	it("returns good at boundary -70", () => {
		expect(interpretSignal(-70)).toBe("-70 dBm (good)");
	});

	it("returns fair at boundary -80", () => {
		expect(interpretSignal(-80)).toBe("-80 dBm (fair)");
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
		customerPing: "Healthy (0% loss, low latency)",
		bandwidth: "Idle (2% current usage — inconclusive)",
		neighborResults: [] as Array<{ userName: string; ping: string }>,
		signalStrength: "-62 dBm (good)",
	};

	it("diagnoses BLOCKED account", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "BLOCKED",
			accountActive: false,
		});
		expect(result.diagnosis).toContain("blocked");
		expect(result.actionNeeded).toContain("resolve the block");
	});

	it("diagnoses EXPIRED account", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "EXPIRED",
			accountActive: false,
		});
		expect(result.diagnosis).toContain("expired");
		expect(result.actionNeeded).toContain("Renew");
	});

	it("diagnoses DISABLED account", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "DISABLED",
			accountActive: false,
		});
		expect(result.diagnosis).toContain("disabled");
		expect(result.actionNeeded).toContain("reactivate");
	});

	it("diagnoses FUP while online", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			fupMode: "1",
		});
		expect(result.diagnosis).toContain("Fair Usage Policy");
		expect(result.actionNeeded).toContain("quota");
	});

	it("diagnoses offline with AP down", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			accessPointOnline: false,
			customerPing: "Unreachable (100% packet loss)",
		});
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
			customerPing: "Unreachable (100% packet loss)",
		});
		expect(result.diagnosis).toContain("disconnected");
		expect(result.diagnosis).toContain("station");
		expect(result.actionNeeded).toContain("infrastructure");
	});

	it("diagnoses offline with all neighbors also unreachable", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			customerPing: "Unreachable (100% packet loss)",
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
		expect(result.diagnosis).toContain("infrastructure issue");
	});

	it("diagnoses offline with neighbors online (isolated issue)", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			customerPing: "Unreachable (100% packet loss)",
			neighborResults: [
				{
					userName: "peer1",
					ping: "Healthy (0% loss, low latency)",
				},
			],
		});
		expect(result.diagnosis).toContain("isolated");
	});

	it("diagnoses online with saturated bandwidth", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			bandwidth: "Saturated (92% of plan limit in use)",
		});
		expect(result.diagnosis).toContain("saturated");
		expect(result.actionNeeded).toContain("bandwidth");
	});

	it("diagnoses online + healthy as healthy", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
		});
		expect(result.diagnosis).toContain("healthy");
		expect(result.actionNeeded).toContain("speed test");
	});

	it("notes FUP as secondary when offline", () => {
		const result = buildDiagnosis({
			...baseInput,
			accountStatus: "Active",
			online: false,
			fupMode: "1",
			customerPing: "Unreachable (100% packet loss)",
		});
		expect(result.diagnosis).toContain("disconnected");
		expect(result.diagnosis).toContain("FUP");
		expect(result.diagnosis).toContain("NOT the cause");
	});
});
