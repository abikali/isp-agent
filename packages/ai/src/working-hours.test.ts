import { describe, expect, it } from "vitest";
import { describeNextOpen, resolveWorkingHoursState } from "./working-hours";

// Mon–Sat 09:00–18:00 Beirut. September = UTC+3.
const agent = {
	workingHoursEnabled: true,
	workingDays: [1, 2, 3, 4, 5, 6],
	workingHoursStart: "09:00",
	workingHoursEnd: "18:00",
	offDutyMessage: "Emergencies: 03 123 456",
};

describe("resolveWorkingHoursState", () => {
	it("is on duty mid-day on a working day", () => {
		// Thu 10 Sep 2026 11:00 Beirut = 08:00Z
		expect(
			resolveWorkingHoursState(agent, new Date("2026-09-10T08:00:00Z")),
		).toEqual({ offDuty: false, nextOpen: null, message: null });
	});

	it("is off duty before opening and points at today's start", () => {
		// 07:30 Beirut
		const state = resolveWorkingHoursState(
			agent,
			new Date("2026-09-10T04:30:00Z"),
		);
		expect(state.offDuty).toBe(true);
		expect(state.nextOpen?.toISOString()).toBe("2026-09-10T06:00:00.000Z");
		expect(state.message).toBe("Emergencies: 03 123 456");
	});

	it("is off duty in the evening and points at tomorrow", () => {
		// 22:00 Beirut Thu
		const state = resolveWorkingHoursState(
			agent,
			new Date("2026-09-10T19:00:00Z"),
		);
		expect(state.nextOpen?.toISOString()).toBe("2026-09-11T06:00:00.000Z");
		expect(
			describeNextOpen(state.nextOpen, new Date("2026-09-10T19:00:00Z")),
		).toBe("tomorrow morning (09:00)");
	});

	it("skips Sunday", () => {
		// Sun 13 Sep 2026 12:00 Beirut
		const now = new Date("2026-09-13T09:00:00Z");
		const state = resolveWorkingHoursState(agent, now);
		expect(state.offDuty).toBe(true);
		expect(state.nextOpen?.toISOString()).toBe("2026-09-14T06:00:00.000Z");
		expect(describeNextOpen(state.nextOpen, now)).toBe(
			"tomorrow morning (09:00)",
		);
	});

	it("names the weekday when the next slot is further out", () => {
		const weekend = { ...agent, workingDays: [1] };
		const now = new Date("2026-09-10T19:00:00Z"); // Thu
		const state = resolveWorkingHoursState(weekend, now);
		expect(describeNextOpen(state.nextOpen, now)).toBe(
			"Monday morning (09:00)",
		);
	});

	it("is on duty when disabled or misconfigured", () => {
		expect(
			resolveWorkingHoursState(
				{ ...agent, workingHoursEnabled: false },
				new Date("2026-09-13T09:00:00Z"),
			).offDuty,
		).toBe(false);
		expect(
			resolveWorkingHoursState(
				{ ...agent, workingDays: [] },
				new Date("2026-09-13T09:00:00Z"),
			).offDuty,
		).toBe(false);
		expect(
			resolveWorkingHoursState(
				{ ...agent, workingHoursEnd: "08:00" },
				new Date("2026-09-13T09:00:00Z"),
			).offDuty,
		).toBe(false);
	});

	it("uses the winter offset after the DST switch", () => {
		// Nov 2026: Beirut is UTC+2. 07:00Z = 09:00 Beirut → on duty.
		expect(
			resolveWorkingHoursState(agent, new Date("2026-11-10T07:00:00Z"))
				.offDuty,
		).toBe(false);
		// 06:30Z = 08:30 Beirut → off, opens at 07:00Z
		expect(
			resolveWorkingHoursState(
				agent,
				new Date("2026-11-10T06:30:00Z"),
			).nextOpen?.toISOString(),
		).toBe("2026-11-10T07:00:00.000Z");
	});
});
