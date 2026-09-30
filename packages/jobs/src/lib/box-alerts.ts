import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { boxShortName } from "@repo/utils";
import { getRedisConnection } from "../connection";

/** Alert once a box reaches this many active customers. */
export const BOX_ALERT_THRESHOLD = 3;
const DEDUPE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_LISTED = 10;

export interface BoxJoin {
	username: string | null;
	iface: string;
}

export type OrganizationNotifier = (
	organizationId: string,
	payload: {
		category: "monitoring";
		type: "warning";
		title: string;
		message: string;
		link?: string;
	},
) => Promise<void>;

/** Redis key for one (box, size) alert. */
export function boxAlertKey(
	organizationId: string,
	iface: string,
	count: number,
): string {
	return `box-alert:${organizationId}:${iface}:${count}`;
}

/**
 * After an iRadius sync, warn the org when a customer was newly put on a
 * fiber box that now serves `BOX_ALERT_THRESHOLD`+ active customers. Only
 * transitions count (the caller passes customers whose interface changed),
 * so the ~70 boxes already over the line don't all fire on the first run.
 * Deduped per (box, count) for 30 days.
 */
export async function alertCrowdedBoxes(input: {
	organizationId: string;
	organizationSlug: string | null;
	joins: BoxJoin[];
	notify: OrganizationNotifier;
}): Promise<number> {
	const byInterface = new Map<string, string[]>();
	for (const join of input.joins) {
		const names = byInterface.get(join.iface) ?? [];
		if (join.username) {
			names.push(join.username);
		}
		byInterface.set(join.iface, names);
	}

	let sent = 0;
	const redis = getRedisConnection();
	for (const [iface, joined] of byInterface) {
		const members = await db.customer.findMany({
			where: {
				organizationId: input.organizationId,
				mikrotikInterface: iface,
				deletedAt: null,
				status: "ACTIVE",
			},
			select: { username: true },
			orderBy: { username: "asc" },
		});
		const count = members.length;
		if (count < BOX_ALERT_THRESHOLD) {
			continue;
		}
		const fresh = await redis.set(
			boxAlertKey(input.organizationId, iface, count),
			"1",
			"EX",
			DEDUPE_TTL_SECONDS,
			"NX",
		);
		if (fresh !== "OK") {
			continue;
		}
		const names = members
			.map((m) => m.username)
			.filter((n): n is string => Boolean(n));
		const listed = names.slice(0, MAX_LISTED).join(", ");
		const who = joined.length > 0 ? joined.join(", ") : "A customer";
		try {
			await input.notify(input.organizationId, {
				category: "monitoring",
				type: "warning",
				title: `Fiber box ${boxShortName(iface)} has ${count} customers`,
				message: `${who} joined box ${boxShortName(iface)} (now ${count} customers: ${listed}${names.length > MAX_LISTED ? ", …" : ""}). If it fails they all go down.`,
				...(input.organizationSlug
					? { link: `/app/${input.organizationSlug}/customers` }
					: {}),
			});
			sent++;
		} catch (error) {
			logger.warn("[box-alerts] notify failed", {
				iface,
				error: String(error),
			});
		}
	}
	return sent;
}
