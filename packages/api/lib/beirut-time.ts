import { beirutWallClockToUtc } from "@repo/utils";

export { beirutDateString, beirutEndOfDay } from "@repo/utils";

/**
 * iRadius stores DATETIMEs as naive Beirut wall-clock literals and stamps its
 * own rows with the server's NOW() in local time, so everything we write or
 * compare must be converted the same way — or it lands three hours off.
 */

/** MySQL DATETIME literal (`YYYY-MM-DD HH:MM:SS`) in Beirut wall-clock. */
export function toIRadiusDateTime(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Beirut",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	const hour = get("hour") === "24" ? "00" : get("hour");
	return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/**
 * Inverse of {@link toIRadiusDateTime}: the instant a Beirut-naive iRadius
 * DATETIME (as mysql2 returns it with `dateStrings: true`) denotes. Returns
 * null for empty / zero dates.
 */
export function fromIRadiusDateTime(value: unknown): Date | null {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (typeof value !== "string" || !value || value.startsWith("0000")) {
		return null;
	}
	const [datePart, timePart = "00:00:00"] = value.trim().split(/[ T]/);
	const seconds = Number(timePart.split(":")[2] ?? 0);
	const minute = beirutWallClockToUtc(`${datePart}T${timePart.slice(0, 5)}`);
	if (Number.isNaN(minute.getTime())) {
		return null;
	}
	return new Date(
		minute.getTime() + (Number.isFinite(seconds) ? seconds : 0) * 1000,
	);
}
