import { describe, expect, it } from "vitest";
import { landlineUpdate } from "../lib/landline";

describe("landlineUpdate", () => {
	it("stores a landline in E.164 and stamps when it was asked", () => {
		const update = landlineUpdate({ has: true, number: "04 123456" });
		expect(update.hasLandline).toBe(true);
		expect(update.landline).toBe("+9614123456");
		expect(update.landlineCheckedAt).toBeInstanceOf(Date);
	});

	it("rejects a mobile typed as the landline", () => {
		expect(() =>
			landlineUpdate({ has: true, number: "71 123456" }),
		).toThrow(/landline/);
	});

	it("records 'no landline' without a number", () => {
		const update = landlineUpdate({ has: false });
		expect(update).toMatchObject({ hasLandline: false, landline: null });
		expect(update.landlineCheckedAt).toBeInstanceOf(Date);
	});

	it("resets to never-asked", () => {
		expect(landlineUpdate({ has: null })).toEqual({
			hasLandline: null,
			landline: null,
			landlineCheckedAt: null,
		});
	});
});
