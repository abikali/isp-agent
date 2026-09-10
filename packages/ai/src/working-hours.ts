import { beirutParts, beirutWallClockToUtc, beirutWeekday } from "@repo/utils";

/**
 * Effective "is the team on duty" state for an agent at a point in time.
 *
 * Pure, like `resolveMaintenanceState`: the caller passes the clock. All
 * arithmetic is in Asia/Beirut wall-clock terms — the crew, the customers
 * and the owner all live there, and DST is handled by the shared helpers.
 *
 * Off duty changes ONE thing in the prompt: the bot must not promise a
 * same-day visit. It keeps answering, diagnosing and escalating.
 */
export interface WorkingHoursFields {
	workingHoursEnabled?: boolean | null;
	/** 0 = Sunday … 6 = Saturday */
	workingDays?: number[] | null;
	/** "HH:mm" Beirut wall clock */
	workingHoursStart?: string | null;
	workingHoursEnd?: string | null;
	offDutyMessage?: string | null;
}

export interface WorkingHoursState {
	offDuty: boolean;
	/** Next moment the team is on duty (UTC instant), null when never. */
	nextOpen: Date | null;
	message: string | null;
}

function toMinutes(hhmm: string | null | undefined, fallback: number): number {
	const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
	if (!m) {
		return fallback;
	}
	return Number(m[1]) * 60 + Number(m[2]);
}

const ON_DUTY: WorkingHoursState = {
	offDuty: false,
	nextOpen: null,
	message: null,
};

export function resolveWorkingHoursState(
	agent: WorkingHoursFields | null | undefined,
	now: Date = new Date(),
): WorkingHoursState {
	if (!agent?.workingHoursEnabled) {
		return ON_DUTY;
	}
	const days = new Set(
		(agent.workingDays ?? []).filter((d) => d >= 0 && d <= 6),
	);
	if (days.size === 0) {
		return ON_DUTY;
	}
	const startMin = toMinutes(agent.workingHoursStart, 9 * 60);
	const endMin = toMinutes(agent.workingHoursEnd, 18 * 60);
	if (endMin <= startMin) {
		return ON_DUTY;
	}

	const parts = beirutParts(now);
	const nowMin = parts.hour * 60 + parts.minute;
	const weekday = beirutWeekday(now);
	if (days.has(weekday) && nowMin >= startMin && nowMin < endMin) {
		return ON_DUTY;
	}

	// Next opening: walk Beirut calendar days forward from today.
	let nextOpen: Date | null = null;
	for (let i = 0; i <= 7 && !nextOpen; i++) {
		const day = new Date(
			Date.UTC(parts.year, parts.month - 1, parts.day + i),
		);
		if (!days.has(day.getUTCDay())) {
			continue;
		}
		if (i === 0 && nowMin >= startMin) {
			continue;
		}
		const y = day.getUTCFullYear();
		const m = String(day.getUTCMonth() + 1).padStart(2, "0");
		const d = String(day.getUTCDate()).padStart(2, "0");
		const start = agent.workingHoursStart ?? "09:00";
		const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
		const mm = String(startMin % 60).padStart(2, "0");
		nextOpen = beirutWallClockToUtc(
			`${y}-${m}-${d}T${start.length === 5 ? start : `${hh}:${mm}`}`,
		);
	}

	return {
		offDuty: true,
		nextOpen,
		message: agent.offDutyMessage?.trim() || null,
	};
}

const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

/** "later today from 09:00" / "tomorrow morning (09:00)" / "Monday 09:00". */
export function describeNextOpen(nextOpen: Date | null, now: Date): string {
	if (!nextOpen) {
		return "when the team is back";
	}
	const a = beirutParts(now);
	const b = beirutParts(nextOpen);
	const hhmm = `${String(b.hour).padStart(2, "0")}:${String(b.minute).padStart(2, "0")}`;
	const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
	if (sameDay) {
		return `later today from ${hhmm}`;
	}
	const tomorrow = new Date(Date.UTC(a.year, a.month - 1, a.day + 1));
	const isTomorrow =
		tomorrow.getUTCFullYear() === b.year &&
		tomorrow.getUTCMonth() + 1 === b.month &&
		tomorrow.getUTCDate() === b.day;
	const morning = b.hour < 12 ? " morning" : "";
	if (isTomorrow) {
		return `tomorrow${morning} (${hhmm})`;
	}
	return `${WEEKDAYS[beirutWeekday(nextOpen)]}${morning} (${hhmm})`;
}
