import { boxShortName, isBoxInterface } from "@repo/utils";
import { describe, expect, it } from "vitest";
import { boundingBox, groupNearbyBoxes } from "../lib/nearby-boxes";

const SAMIR_BOX = "(VM-PPPoe4)-vlan2032-zone4-olt1-PON4-samirhalabe";

function customer(
	id: string,
	latitude: number | null,
	longitude: number | null,
	mikrotikInterface: string | null = SAMIR_BOX,
) {
	return {
		id,
		username: id,
		firstName: null,
		lastName: null,
		status: "ACTIVE",
		latitude,
		longitude,
		mikrotikInterface,
	};
}

describe("isBoxInterface", () => {
	it("matches PON and OLT interfaces only", () => {
		expect(isBoxInterface(SAMIR_BOX)).toBe(true);
		expect(isBoxInterface("vlan1125-bicho-OLT")).toBe(true);
		expect(isBoxInterface("ether3-sector-north")).toBe(false);
		expect(isBoxInterface(null)).toBe(false);
	});
});

describe("boxShortName", () => {
	it("strips the PPPoE server, VLAN and zone prefixes", () => {
		expect(boxShortName(SAMIR_BOX)).toBe("olt1-PON4-samirhalabe");
		expect(boxShortName("PON1-OLT1-jwarobuilding")).toBe(
			"PON1-OLT1-jwarobuilding",
		);
	});
});

describe("boundingBox", () => {
	it("widens longitude by 1/cos(latitude)", () => {
		const box = boundingBox(33.878, 35.565, 60);
		const dLat = box.latMax - 33.878;
		const dLng = box.lngMax - 35.565;
		expect(dLat).toBeCloseTo(60 / 111_320, 8);
		expect(dLng / dLat).toBeCloseTo(
			1 / Math.cos((33.878 * Math.PI) / 180),
			4,
		);
	});
});

describe("groupNearbyBoxes", () => {
	const origin = { latitude: 33.878, longitude: 35.565 };

	it("groups neighbours within the radius by box, nearest first", () => {
		const groups = groupNearbyBoxes(
			origin,
			[
				customer("sebouh", 33.878, 35.5652),
				customer("samirhalabi", 33.878, 35.5649),
				customer("far-away", 33.89, 35.58),
				customer("other-box", 33.8783, 35.565, "olt1-PON5-maher"),
				customer("sector", 33.878, 35.565, "ether3-sector-north"),
				customer("no-pin", null, null),
			],
			60,
		);
		expect(groups.map((g) => g.iface)).toEqual([
			SAMIR_BOX,
			"olt1-PON5-maher",
		]);
		expect(groups[0]?.nearby.map((c) => c.id)).toEqual([
			"samirhalabi",
			"sebouh",
		]);
		expect(groups[0]?.nearby[0]?.distanceM).toBeLessThanOrEqual(10);
	});

	it("returns nothing when no box is close enough", () => {
		expect(
			groupNearbyBoxes(origin, [customer("far", 33.9, 35.6)], 60),
		).toEqual([]);
	});
});
