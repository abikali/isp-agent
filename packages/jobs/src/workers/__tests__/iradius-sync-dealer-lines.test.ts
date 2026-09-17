import { describe, expect, it, vi } from "vitest";
import {
	inferConnectionType,
	resolveSyncDealers,
} from "../iradius-sync-helpers";

// The helpers module pulls phone utilities from `@repo/database`, whose index
// eagerly constructs the Prisma client. These tests only exercise pure dealer
// and connection-type resolution, so stub both database entry points
// (`vi.mock` is hoisted above the import).
vi.mock("@repo/database", () => ({
	buildPhonesFromSync: () => [],
	extractPhoneNumbers: () => [],
}));
vi.mock("@repo/database/iradius", () => ({
	toBooleanFromBit: (val: unknown) => Boolean(val),
}));

const ORG = "org-abiroot";
const MASTER = "dealer-johnnyh";
const FIBER = "dealer-libancom-fiber";

const dealers = [
	{ id: MASTER, externalId: "53853", internalLineOfOrganizationId: null },
	{ id: FIBER, externalId: "84545", internalLineOfOrganizationId: ORG },
	{
		id: "dealer-reseller",
		externalId: "70000",
		internalLineOfOrganizationId: null,
	},
	{
		id: "dealer-other-line",
		externalId: "80000",
		internalLineOfOrganizationId: "org-other",
	},
	{
		id: "dealer-local",
		externalId: null,
		internalLineOfOrganizationId: null,
	},
];

describe("resolveSyncDealers", () => {
	it("maps the org's internal lines onto its master dealer", () => {
		const { dealerMap, internalLineExtIds, internalLineDealerIds } =
			resolveSyncDealers(dealers, ORG, MASTER);

		expect(dealerMap.get(84545)).toBe(MASTER);
		expect(dealerMap.get(53853)).toBe(MASTER);
		expect(dealerMap.get(70000)).toBe("dealer-reseller");
		expect([...internalLineExtIds]).toEqual([84545]);
		expect([...internalLineDealerIds]).toEqual([FIBER]);
	});

	it("leaves another org's lines on their own dealer row", () => {
		const { dealerMap, internalLineExtIds } = resolveSyncDealers(
			dealers,
			ORG,
			MASTER,
		);

		expect(dealerMap.get(80000)).toBe("dealer-other-line");
		expect(internalLineExtIds.has(80000)).toBe(false);
	});

	it("does not treat lines as internal when the org has no master", () => {
		const { dealerMap, internalLineExtIds } = resolveSyncDealers(
			dealers,
			ORG,
			null,
		);

		expect(dealerMap.get(84545)).toBe(FIBER);
		expect(internalLineExtIds.size).toBe(0);
	});

	it("skips dealers that were never synced from iRadius", () => {
		const { dealerMap } = resolveSyncDealers(dealers, ORG, MASTER);

		expect([...dealerMap.values()]).not.toContain("dealer-local");
	});
});

describe("inferConnectionType", () => {
	const lines = new Set([84545]);
	const plan = (
		name: string,
		ipPoolName: string | null = null,
		dealerExternalId: string | null = "53853",
	) => ({ name, ipPoolName, dealerExternalId });

	it("defaults to wireless without a plan", () => {
		expect(inferConnectionType(null, lines)).toBe("WIRELESS");
	});

	it("reads fiber and DSL from the plan name", () => {
		expect(inferConnectionType(plan("FIBER 300GB"), lines)).toBe("FIBER");
		expect(inferConnectionType(plan("DSL 4M", null, "84545"), lines)).toBe(
			"DSL",
		);
	});

	it("treats plans on the fiber pool as fiber", () => {
		expect(
			inferConnectionType(plan("Open Speed 900G", "pool-fiber"), lines),
		).toBe("FIBER");
	});

	it("treats unnamed plans on an internal line as fiber", () => {
		expect(
			inferConnectionType(plan("Open Speed 300G", null, "84545"), lines),
		).toBe("FIBER");
	});

	it("keeps ordinary wireless plans wireless", () => {
		expect(inferConnectionType(plan("5M NEW", "pool-5m"), lines)).toBe(
			"WIRELESS",
		);
	});
});
