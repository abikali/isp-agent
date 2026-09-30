import { beirutWallClockToUtc } from "@repo/utils";

export type IngestDue =
	| { ok: true; dueDate: Date | null; dueHasTime: boolean }
	| { ok: false; error: string };

const BEIRUT_LOCAL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// ISO-8601 with an explicit offset or Z, e.g. 2026-09-30T14:30:00+03:00
const ISO_WITH_OFFSET =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Due fields of the task-ingest payload:
 * - `due_at`: an exact time — ISO-8601 with an offset, or `YYYY-MM-DD HH:mm`
 *   read as Beirut wall-clock. Reminded before it.
 * - `due_date`: `YYYY-MM-DD`, a whole Beirut day (stored at Beirut noon).
 * `due_at` wins when both are sent. Unparseable values are an error (400).
 */
export function parseIngestDue(body: {
	due_at?: string | undefined;
	due_date?: string | undefined;
}): IngestDue {
	const dueAt = body.due_at?.trim();
	const dueDay = body.due_date?.trim();
	if (dueAt) {
		const local = BEIRUT_LOCAL.exec(dueAt);
		const date = local
			? beirutWallClockToUtc(`${local[1]}T${local[2]}`)
			: ISO_WITH_OFFSET.test(dueAt)
				? new Date(dueAt)
				: null;
		if (!date || Number.isNaN(date.getTime())) {
			return {
				ok: false,
				error: "Invalid due_at — use ISO-8601 with an offset or 'YYYY-MM-DD HH:mm' (Beirut)",
			};
		}
		return { ok: true, dueDate: date, dueHasTime: true };
	}
	if (dueDay) {
		const date = DATE_ONLY.test(dueDay)
			? beirutWallClockToUtc(`${dueDay}T12:00`)
			: null;
		if (!date || Number.isNaN(date.getTime())) {
			return { ok: false, error: "Invalid due_date — use 'YYYY-MM-DD'" };
		}
		return { ok: true, dueDate: date, dueHasTime: false };
	}
	return { ok: true, dueDate: null, dueHasTime: false };
}
