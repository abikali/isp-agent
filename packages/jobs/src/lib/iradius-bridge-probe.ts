import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { logger } from "@repo/logs";

export type BridgeProbeStatus =
	| "present"
	| "missing"
	| "unconfigured"
	| "unreachable";

const ALERT_TITLE = "iRadius bridge missing";
/** Re-alert an admin at most once a day while the bridge stays missing. */
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Is the LibanCom bridge servlet still installed in the iRadius Tomcat app?
 * It is POST-only, so a GET answers 405 while it is there and 404 once a
 * vendor ROOT.war redeploy has wiped it (as happened on 2026-09-16, after
 * which app approvals silently stopped billing the dealer).
 */
export async function probeIRadiusBridge(
	fetchImpl: typeof fetch = fetch,
): Promise<BridgeProbeStatus> {
	const url =
		process.env["IRADIUS_BRIDGE_URL"] || process.env["IRADIUS_CHARGE_URL"];
	if (!url) {
		return "unconfigured";
	}
	try {
		const res = await fetchImpl(url, {
			method: "GET",
			signal: AbortSignal.timeout(15000),
		});
		if (res.status === 405) {
			return "present";
		}
		if (res.status === 404) {
			return "missing";
		}
		logger.warn("[iRadius bridge probe] unexpected status", {
			status: res.status,
		});
		return "unreachable";
	} catch (error) {
		logger.warn("[iRadius bridge probe] request failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return "unreachable";
	}
}

/**
 * Hourly job: probe the bridge and, when it is gone, log an error and raise
 * an in-app notification for the owners/admins of every organization that
 * uses iRadius (at most once a day per admin). Returns the number of
 * notifications created.
 */
export async function checkIRadiusBridge(
	fetchImpl: typeof fetch = fetch,
): Promise<number> {
	const status = await probeIRadiusBridge(fetchImpl);
	if (status !== "missing") {
		return 0;
	}
	logger.error(
		"[iRadius bridge probe] LibanCom bridge servlet is missing (HTTP 404) — new-user charges, renewals and deletes will fail until it is reinstalled",
	);

	const admins = await db.member.findMany({
		where: {
			role: { in: ["owner", "admin"] },
			organization: { iradiusDisabled: false },
		},
		select: { userId: true },
	});
	const userIds = [...new Set(admins.map((m) => m.userId))];
	if (userIds.length === 0) {
		return 0;
	}
	const recentlyAlerted = await db.notification.findMany({
		where: {
			userId: { in: userIds },
			title: ALERT_TITLE,
			createdAt: { gte: new Date(Date.now() - ALERT_COOLDOWN_MS) },
		},
		select: { userId: true },
	});
	const skip = new Set(recentlyAlerted.map((n) => n.userId));
	const targets = userIds.filter((id) => !skip.has(id));
	if (targets.length === 0) {
		return 0;
	}
	await db.notification.createMany({
		data: targets.map((userId) => ({
			id: createId(),
			userId,
			type: "error",
			title: ALERT_TITLE,
			message:
				"The LibanCom servlet on the iRadius server is gone (likely a vendor redeploy). New customers are created but NOT billed, and renew / delete from the app will fail until it is reinstalled (/var/local/libancom-bridge/install.sh).",
		})),
	});
	return targets.length;
}
