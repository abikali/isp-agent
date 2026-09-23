import { describe, expect, it } from "vitest";
import { stripInternalMarkers } from "./chat-formatting";
import {
	buildFollowUpInstruction,
	isNoFollowUpReply,
	isWithinFollowUpHours,
	resolveFollowUpFireAt,
} from "./follow-up";

const HOUR = 60 * 60_000;

describe("isNoFollowUpReply", () => {
	it.each([
		"NO_FOLLOW_UP",
		"NO_FOLLOW_UP.",
		"`NO_FOLLOW_UP`",
		"*NO_FOLLOW_UP*",
		"no_follow_up",
		"NO FOLLOW UP",
		"The exchange is finished.\nNO_FOLLOW_UP",
	])("treats %j as declined", (text) => {
		expect(isNoFollowUpReply(text)).toBe(true);
	});

	it("lets a real follow-up through", () => {
		expect(isNoFollowUpReply("مرحبا، فيك تبعتلنا الـ location تبعك؟")).toBe(
			false,
		);
		expect(isNoFollowUpReply("Is the internet working now?")).toBe(false);
	});
});

describe("buildFollowUpInstruction", () => {
	it("is stripped entirely when the model echoes it", () => {
		const instruction = buildFollowUpInstruction(60, null);
		expect(stripInternalMarkers(instruction)).toBe("");
		expect(stripInternalMarkers(`${instruction}\nHello?`)).toBe("Hello?");
	});

	it("tells the model to stay silent when the team was notified", () => {
		expect(buildFollowUpInstruction(60, null)).toContain(
			"the team was notified",
		);
	});
});

describe("isWithinFollowUpHours (Beirut, UTC+3 in September)", () => {
	it("opens at 09:00 and closes at 20:30", () => {
		expect(isWithinFollowUpHours(new Date("2026-09-17T05:59:00Z"))).toBe(
			false,
		);
		expect(isWithinFollowUpHours(new Date("2026-09-17T06:00:00Z"))).toBe(
			true,
		);
		expect(isWithinFollowUpHours(new Date("2026-09-17T17:29:00Z"))).toBe(
			true,
		);
		expect(isWithinFollowUpHours(new Date("2026-09-17T17:30:00Z"))).toBe(
			false,
		);
	});
});

describe("resolveFollowUpFireAt", () => {
	it("keeps a nudge that is due inside the window", () => {
		// 10:00 Beirut reply + 60 min → 11:00 Beirut
		expect(
			resolveFollowUpFireAt(new Date("2026-09-17T07:00:00Z"), 60),
		).toEqual(new Date("2026-09-17T08:00:00Z"));
	});

	it("moves an evening nudge to 09:30 the next morning", () => {
		// 20:00 Beirut reply + 60 min → 21:00 → next day 09:30 Beirut
		expect(
			resolveFollowUpFireAt(new Date("2026-09-17T17:00:00Z"), 60),
		).toEqual(new Date("2026-09-18T06:30:00Z"));
	});

	it("moves a small-hours nudge to 09:30 the same morning", () => {
		// 02:00 Beirut reply + 60 min → 03:00 → 09:30 Beirut same day
		expect(
			resolveFollowUpFireAt(new Date("2026-09-16T23:00:00Z"), 60),
		).toEqual(new Date("2026-09-17T06:30:00Z"));
	});

	it("treats 20:30 as closed", () => {
		// 19:30 Beirut reply + 60 min → exactly 20:30 → next morning
		const repliedAt = new Date("2026-09-17T16:30:00Z");
		const fireAt = resolveFollowUpFireAt(repliedAt, 60);
		expect(fireAt).toEqual(new Date("2026-09-18T06:30:00Z"));
		expect(
			(fireAt?.getTime() ?? 0) - repliedAt.getTime(),
		).toBeLessThanOrEqual(14 * HOUR);
	});

	it("drops a shifted nudge that would land more than 14 hours after the reply", () => {
		// 18:00 Beirut reply + 180 min → 21:00 → 09:30 is 15.5 h after
		expect(
			resolveFollowUpFireAt(new Date("2026-09-17T15:00:00Z"), 180),
		).toBeNull();
	});

	it("uses winter time (UTC+2) in January", () => {
		// 20:00 Beirut reply + 60 min → next day 09:30 Beirut = 07:30Z
		expect(
			resolveFollowUpFireAt(new Date("2026-01-15T18:00:00Z"), 60),
		).toEqual(new Date("2026-01-16T07:30:00Z"));
	});
});

describe("resolveFollowUpFireAt with a custom window and later attempts", () => {
	const window = { start: "10:00", end: "18:00" };

	it("uses the agent's window", () => {
		// 17:30 Beirut + 60 min → 18:30, closed → next day 10:30 Beirut
		expect(
			resolveFollowUpFireAt(new Date("2026-09-17T14:30:00Z"), 60, window),
		).toEqual(new Date("2026-09-18T07:30:00Z"));
	});

	it("moves a later attempt instead of dropping it", () => {
		// 18:00 Beirut + 180 min → 21:00 → 09:30 next day, 15.5 h later
		expect(
			resolveFollowUpFireAt(
				new Date("2026-09-17T15:00:00Z"),
				180,
				undefined,
				2,
			),
		).toEqual(new Date("2026-09-18T06:30:00Z"));
	});
});

describe("buildFollowUpInstruction for repeat attempts", () => {
	it("marks the last attempt as closing", () => {
		const text = buildFollowUpInstruction(1440, null, 2, 2);
		expect(text).toContain("follow-up 2 of 2");
		expect(text).toContain("LAST one");
		expect(stripInternalMarkers(text)).toBe("");
	});

	it("says nothing about repeats on the first attempt", () => {
		expect(buildFollowUpInstruction(30, null, 1, 3)).not.toContain(
			"follow-up 1 of",
		);
	});
});
