import { describe, expect, it } from "vitest";
import { parseIngestDue } from "../lib/ingest-due";

describe("parseIngestDue", () => {
	it("reads 'YYYY-MM-DD HH:mm' as Beirut wall-clock with a time", () => {
		const due = parseIngestDue({ due_at: "2026-09-30 14:30" });
		expect(due).toEqual({
			ok: true,
			dueDate: new Date("2026-09-30T11:30:00.000Z"),
			dueHasTime: true,
		});
	});

	it("accepts ISO-8601 with an offset", () => {
		const due = parseIngestDue({ due_at: "2026-09-30T14:30:00+03:00" });
		expect(due.ok && due.dueDate?.toISOString()).toBe(
			"2026-09-30T11:30:00.000Z",
		);
	});

	it("stores a due_date at Beirut noon, date-only", () => {
		const due = parseIngestDue({ due_date: "2026-01-15" });
		expect(due).toEqual({
			ok: true,
			dueDate: new Date("2026-01-15T10:00:00.000Z"),
			dueHasTime: false,
		});
	});

	it("prefers due_at over due_date", () => {
		const due = parseIngestDue({
			due_at: "2026-09-30 09:00",
			due_date: "2026-10-01",
		});
		expect(due.ok && due.dueHasTime).toBe(true);
	});

	it("rejects unparseable or offset-less ISO values", () => {
		expect(parseIngestDue({ due_at: "tomorrow" }).ok).toBe(false);
		expect(parseIngestDue({ due_at: "2026-09-30T14:30:00" }).ok).toBe(
			false,
		);
		expect(parseIngestDue({ due_date: "30/09/2026" }).ok).toBe(false);
	});

	it("is empty when neither field is sent", () => {
		expect(parseIngestDue({})).toEqual({
			ok: true,
			dueDate: null,
			dueHasTime: false,
		});
	});
});
