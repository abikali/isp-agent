import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockIspGet } = vi.hoisted(() => ({ mockIspGet: vi.fn() }));

vi.mock("../lib/isp-api-client", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../lib/isp-api-client")>();
	return { ...actual, ispGet: mockIspGet };
});

import { buildDiagnosis, summarizeOnu } from "../isp-diagnose-customer";
import { fetchInterfacePeers } from "../isp-search-customer";

const config = { baseUrl: "http://isp", userName: "u", password: "p" };

const offlineFiber = {
	accountStatus: "Active",
	accountActive: true,
	online: false,
	fupMode: "0",
	accessPointOnline: null,
	stationOnline: null,
	connectionType: "fiber" as const,
	pingStatus: "unreachable" as const,
	bandwidthStatus: null,
	neighborResults: [],
};

describe("buildDiagnosis with ONU state", () => {
	it("says the fiber box is powered off on Power Off", () => {
		const result = buildDiagnosis({
			...offlineFiber,
			onuStatus: "offline",
			onuDeregReason: "Power Off",
		});
		expect(result.severity).toBe("down");
		expect(result.diagnosis).toContain(
			"fiber box at the building appears powered off",
		);
		expect(result.actionNeeded).toContain("fiber box");
		expect(result.needsHumanFollowUp).toBe(true);
	});

	it("says the fiber link is down on Wire Down", () => {
		const result = buildDiagnosis({
			...offlineFiber,
			onuStatus: "offline",
			onuDeregReason: "Wire Down",
		});
		expect(result.diagnosis).toContain("fiber link appears to be down");
		expect(result.needsHumanFollowUp).toBe(true);
	});

	it("adds nothing when the ONU wasn't found", () => {
		const result = buildDiagnosis({
			...offlineFiber,
			onuStatus: "not_found",
		});
		expect(result.diagnosis).not.toContain("fiber");
	});
});

describe("summarizeOnu", () => {
	const found = {
		applicable: true,
		olt: "OLT2" as const,
		port: "0/5",
		description: "a3iyeblockA",
		result: "found" as const,
		onu: {
			status: "Offline",
			onuId: "EPON0/5:3",
			macAddress: "aa:bb:cc:dd:ee:ff",
			distanceMeters: 812,
			aliveTime: null,
			lastRegTime: "2026-09-29 10:00:00",
			lastDeregTime: "2026-09-30 08:12:00",
			lastDeregReason: "Power Off",
		},
	};

	it("keeps status and reason, never the MAC", () => {
		const summary = summarizeOnu(found);
		expect(summary).toEqual({
			status: "offline",
			lastOfflineReason: "Power Off",
			lastOfflineAt: "2026-09-30 08:12:00",
		});
		expect(JSON.stringify(summary)).not.toContain("aa:bb");
	});

	it("maps not_found, and drops errors and non-OLT interfaces", () => {
		expect(summarizeOnu({ ...found, result: "not_found" })?.status).toBe(
			"not_found",
		);
		expect(summarizeOnu({ ...found, result: "error" })).toBeNull();
		expect(summarizeOnu({ ...found, applicable: false })).toBeNull();
		expect(summarizeOnu(null)).toBeNull();
	});
});

describe("fetchInterfacePeers", () => {
	beforeEach(() => {
		mockIspGet.mockReset();
	});

	it("lists the building interface for fiber, without the customer", async () => {
		mockIspGet.mockResolvedValue([
			{ userName: "salehatah", online: false },
			{ userName: "neighbour", online: true },
		]);
		const result = await fetchInterfacePeers(config, {
			userName: "salehatah",
			mikrotikInterface: "(VM-PPPoe4)-vlan2032-OLT2-PON5-a3iyeblockA",
			accessPointUsers: [{ userName: "ignored", online: true }],
		});
		expect(mockIspGet).toHaveBeenCalledWith(config, "/mikrotik-user-list", {
			mikrotikInterface: "(VM-PPPoe4)-vlan2032-OLT2-PON5-a3iyeblockA",
		});
		expect(result).toEqual({
			source: "interface",
			peers: [{ userName: "neighbour", online: true }],
		});
	});

	it("uses the access point's users for wireless, without the customer", async () => {
		const result = await fetchInterfacePeers(config, {
			userName: "me",
			mikrotikInterface: "<pppoe-me>",
			accessPointUsers: [
				{ userName: "me", online: true },
				{ userName: "other", online: false },
			],
		});
		expect(mockIspGet).not.toHaveBeenCalled();
		expect(result).toEqual({
			source: "accessPoint",
			peers: [{ userName: "other", online: false }],
		});
	});
});
