import { describe, expect, it } from "vitest";
import {
	collectorRoleWhere,
	resolveCashRole,
	usesCollectorWallet,
	workerRoleWhere,
} from "../lib/cash-role";

describe("resolveCashRole", () => {
	it("uses the explicit role over the department", () => {
		expect(
			resolveCashRole({ cashRole: "WORKER", department: "BILLING" }),
		).toBe("WORKER");
		expect(
			resolveCashRole({ cashRole: "BOTH", department: "MANAGEMENT" }),
		).toBe("BOTH");
	});

	it("falls back to billing department → collector", () => {
		expect(resolveCashRole({ cashRole: null, department: "BILLING" })).toBe(
			"COLLECTOR",
		);
	});

	it("falls back to worker for any other or missing department", () => {
		expect(
			resolveCashRole({ cashRole: null, department: "MANAGEMENT" }),
		).toBe("WORKER");
		expect(resolveCashRole({ cashRole: null, department: null })).toBe(
			"WORKER",
		);
	});
});

describe("usesCollectorWallet", () => {
	it("counts collected payments for collectors and dual-role staff only", () => {
		expect(usesCollectorWallet("COLLECTOR")).toBe(true);
		expect(usesCollectorWallet("BOTH")).toBe(true);
		expect(usesCollectorWallet("WORKER")).toBe(false);
	});
});

describe("role where builders", () => {
	it("collector: explicit COLLECTOR/BOTH, or unset + billing, dealer-scoped", () => {
		expect(collectorRoleWhere({ dealerId: "d1" })).toEqual({
			dealerId: "d1",
			OR: [
				{ cashRole: { in: ["COLLECTOR", "BOTH"] } },
				{ cashRole: null, department: "BILLING" },
			],
		});
	});

	it("worker: explicit WORKER/BOTH, or unset + worker portal signals", () => {
		expect(workerRoleWhere("org1")).toEqual({
			OR: [
				{ cashRole: { in: ["WORKER", "BOTH"] } },
				{
					cashRole: null,
					OR: [
						{
							user: {
								members: {
									some: {
										organizationId: "org1",
										role: "worker",
									},
								},
							},
						},
						{ preferredLayout: "worker" },
					],
				},
			],
		});
	});
});
