import { describe, expect, it } from "vitest";
import { resolveMaintenanceState } from "./maintenance";

describe("resolveMaintenanceState", () => {
	it("is inactive when nothing is set", () => {
		expect(resolveMaintenanceState({}, [])).toEqual({
			active: false,
			message: null,
		});
	});

	it("tolerates a missing/undefined windows relation", () => {
		expect(
			resolveMaintenanceState({ maintenanceMode: false }, undefined),
		).toEqual({ active: false, message: null });
	});

	it("is inactive when manual mode is off and no active windows", () => {
		expect(
			resolveMaintenanceState(
				{ maintenanceMode: false, maintenanceMessage: "stale" },
				[],
			),
		).toEqual({ active: false, message: null });
	});

	it("uses the manual message when only the manual toggle is on", () => {
		expect(
			resolveMaintenanceState(
				{
					maintenanceMode: true,
					maintenanceMessage: "Fiber cut downtown",
				},
				[],
			),
		).toEqual({ active: true, message: "Fiber cut downtown" });
	});

	it("is active with null message when manual toggle is on but message empty", () => {
		expect(resolveMaintenanceState({ maintenanceMode: true }, [])).toEqual({
			active: true,
			message: null,
		});
	});

	it("activates from a scheduled window even when manual toggle is off", () => {
		expect(
			resolveMaintenanceState({ maintenanceMode: false }, [
				{ message: "Core router upgrade" },
			]),
		).toEqual({ active: true, message: "Core router upgrade" });
	});

	it("prefers the soonest-ending active window (first in the ordered list)", () => {
		expect(
			resolveMaintenanceState({ maintenanceMode: false }, [
				{ message: "ends first" },
				{ message: "ends later" },
			]),
		).toEqual({ active: true, message: "ends first" });
	});

	it("window message wins over the manual message when both are active", () => {
		expect(
			resolveMaintenanceState(
				{ maintenanceMode: true, maintenanceMessage: "manual" },
				[{ message: "scheduled window" }],
			),
		).toEqual({ active: true, message: "scheduled window" });
	});
});
