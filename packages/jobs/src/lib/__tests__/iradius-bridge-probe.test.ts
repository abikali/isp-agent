import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: {
		member: { findMany: vi.fn() },
		notification: { findMany: vi.fn(), createMany: vi.fn() },
	},
}));

import { db } from "@repo/database";
import {
	checkIRadiusBridge,
	probeIRadiusBridge,
} from "../iradius-bridge-probe";

const mockDb = vi.mocked(db, true);

function fetchReturning(status: number) {
	return vi.fn(
		async () => new Response("", { status }),
	) as unknown as typeof fetch;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("IRADIUS_BRIDGE_URL", "http://iradius.test/iradius/libancom");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("probeIRadiusBridge", () => {
	it("405 means the POST-only servlet is present", async () => {
		await expect(probeIRadiusBridge(fetchReturning(405))).resolves.toBe(
			"present",
		);
	});

	it("404 means it was wiped", async () => {
		await expect(probeIRadiusBridge(fetchReturning(404))).resolves.toBe(
			"missing",
		);
	});

	it("reports unconfigured without a URL", async () => {
		vi.stubEnv("IRADIUS_BRIDGE_URL", "");
		vi.stubEnv("IRADIUS_CHARGE_URL", "");
		const f = fetchReturning(405);
		await expect(probeIRadiusBridge(f)).resolves.toBe("unconfigured");
		expect(f).not.toHaveBeenCalled();
	});

	it("network errors are unreachable, not missing", async () => {
		const f = vi.fn(async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		await expect(probeIRadiusBridge(f)).resolves.toBe("unreachable");
	});
});

describe("checkIRadiusBridge", () => {
	it("does nothing while the bridge is present", async () => {
		await expect(checkIRadiusBridge(fetchReturning(405))).resolves.toBe(0);
		expect(mockDb.member.findMany).not.toHaveBeenCalled();
	});

	it("notifies org admins not alerted in the last day", async () => {
		mockDb.member.findMany.mockResolvedValue([
			{ userId: "u1" },
			{ userId: "u2" },
			{ userId: "u1" },
		] as never);
		mockDb.notification.findMany.mockResolvedValue([
			{ userId: "u2" },
		] as never);

		await expect(checkIRadiusBridge(fetchReturning(404))).resolves.toBe(1);

		const data = mockDb.notification.createMany.mock.calls[0]?.[0]
			?.data as Array<{ userId: string; title: string; type: string }>;
		expect(data).toHaveLength(1);
		expect(data[0]).toMatchObject({
			userId: "u1",
			type: "error",
			title: "iRadius bridge missing",
		});
	});
});
