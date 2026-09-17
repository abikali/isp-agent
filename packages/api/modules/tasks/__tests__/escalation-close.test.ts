import { describe, expect, it } from "vitest";
import {
	appendTaskNote,
	buildEscalationCloseNote,
} from "../lib/escalation-close";

// 2026-09-17 11:05 UTC = 14:05 in Beirut (UTC+3 in September)
const closedAt = new Date("2026-09-17T11:05:00Z");

describe("buildEscalationCloseNote", () => {
	it("names the person and uses Beirut time for a selection close", () => {
		expect(
			buildEscalationCloseNote({ closedByName: "Jhonny", closedAt }),
		).toBe(
			"[2026-09-17 14:05 Beirut] Closed from the Escalations page by Jhonny.",
		);
	});

	it("records the age cutoff for a bulk close", () => {
		expect(
			buildEscalationCloseNote({
				closedByName: "Ayman",
				closedAt,
				olderThanDays: 14,
			}),
		).toBe(
			"[2026-09-17 14:05 Beirut] Closed in bulk (open escalations older than 14 days) by Ayman.",
		);
	});

	it("uses the singular for one day", () => {
		expect(
			buildEscalationCloseNote({
				closedByName: "Ayman",
				closedAt,
				olderThanDays: 1,
			}),
		).toContain("older than 1 day)");
	});
});

describe("appendTaskNote", () => {
	it("returns the note alone when there are no notes", () => {
		expect(appendTaskNote(null, "closed")).toBe("closed");
		expect(appendTaskNote("  \n", "closed")).toBe("closed");
	});

	it("keeps existing notes above the new one", () => {
		expect(appendTaskNote("called customer\n", "closed")).toBe(
			"called customer\n\nclosed",
		);
	});
});
