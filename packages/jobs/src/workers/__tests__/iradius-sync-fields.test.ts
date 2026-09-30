import { describe, expect, it } from "vitest";
import {
	AUTO_UPDATE_FIELDS,
	isConflictTrackedField,
	LOCAL_AUTHORITATIVE_FIELDS,
} from "../iradius-sync-fields";

describe("iRadius sync field classification", () => {
	it("apElectrical is conflict-tracked (it has a local write path)", () => {
		expect(isConflictTrackedField("apElectrical")).toBe(true);
		expect(AUTO_UPDATE_FIELDS.has("apElectrical")).toBe(false);
		expect(LOCAL_AUTHORITATIVE_FIELDS.has("apElectrical")).toBe(false);
	});
});
