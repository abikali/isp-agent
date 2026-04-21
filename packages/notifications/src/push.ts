import { db } from "@repo/database";
import { logger } from "@repo/logs";
import webpush from "web-push";

let configured = false;

function configure(): boolean {
	if (configured) {
		return true;
	}
	const publicKey = process.env["VAPID_PUBLIC_KEY"];
	const privateKey = process.env["VAPID_PRIVATE_KEY"];
	const subject = process.env["VAPID_SUBJECT"];
	if (!publicKey || !privateKey || !subject) {
		return false;
	}
	webpush.setVapidDetails(subject, publicKey, privateKey);
	configured = true;
	return true;
}

interface BadgePayload {
	type: "badge";
	count: number;
}

async function sendToUser(
	userId: string,
	payload: BadgePayload,
): Promise<void> {
	if (!configure()) {
		return;
	}
	const subs = await db.pushSubscription.findMany({
		where: { userId },
		select: { id: true, endpoint: true, p256dh: true, auth: true },
	});
	if (subs.length === 0) {
		return;
	}
	const body = JSON.stringify(payload);
	const stale: string[] = [];
	await Promise.all(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{
						endpoint: sub.endpoint,
						keys: { p256dh: sub.p256dh, auth: sub.auth },
					},
					body,
				);
			} catch (error) {
				const statusCode = (error as { statusCode?: number })
					.statusCode;
				if (statusCode === 404 || statusCode === 410) {
					stale.push(sub.id);
				} else {
					logger.warn("push: failed to deliver", {
						userId,
						endpoint: sub.endpoint,
						statusCode,
					});
				}
			}
		}),
	);
	if (stale.length > 0) {
		await db.pushSubscription.deleteMany({
			where: { id: { in: stale } },
		});
	}
}

/**
 * Tell every billing-enabled member of an organization to refresh their
 * app-icon badge. Fire-and-forget; we do not block the mutation on push.
 */
export function notifyBadgeForOrganization(organizationId: string): void {
	pushBadgeRefresh(organizationId).catch((error) => {
		logger.warn("push: badge refresh failed", {
			organizationId,
			error: error instanceof Error ? error.message : String(error),
		});
	});
}

async function pushBadgeRefresh(organizationId: string): Promise<void> {
	const members = await db.member.findMany({
		where: { organizationId },
		select: { userId: true },
	});
	if (members.length === 0) {
		return;
	}
	const userIds = Array.from(new Set(members.map((m) => m.userId)));
	const counts = await getUnreviewedCountsPerUser(userIds);
	await Promise.all(
		userIds.map((userId) =>
			sendToUser(userId, {
				type: "badge",
				count: counts.get(userId) ?? 0,
			}),
		),
	);
}

/**
 * Aggregate unreviewed payment count across every organization a user belongs
 * to. Simple, org-wide count — dealer/collector scoping is applied in the
 * foreground query when the app is open.
 */
async function getUnreviewedCountsPerUser(
	userIds: string[],
): Promise<Map<string, number>> {
	const memberships = await db.member.findMany({
		where: { userId: { in: userIds } },
		select: { userId: true, organizationId: true },
	});
	const byOrg = new Map<string, string[]>();
	for (const m of memberships) {
		const list = byOrg.get(m.organizationId) ?? [];
		list.push(m.userId);
		byOrg.set(m.organizationId, list);
	}

	const orgCounts = new Map<string, number>();
	await Promise.all(
		Array.from(byOrg.keys()).map(async (organizationId) => {
			orgCounts.set(
				organizationId,
				await countUnreviewedForOrg(organizationId),
			);
		}),
	);

	const result = new Map<string, number>();
	for (const userId of userIds) {
		result.set(userId, 0);
	}
	for (const m of memberships) {
		const current = result.get(m.userId) ?? 0;
		result.set(m.userId, current + (orgCounts.get(m.organizationId) ?? 0));
	}
	return result;
}

async function countUnreviewedForOrg(organizationId: string): Promise<number> {
	const [flagged, mismatchCandidates] = await Promise.all([
		db.payment.count({
			where: {
				organizationId,
				reviewedAt: null,
				OR: [{ freeAccount: true }, { stoppedAccount: true }],
			},
		}),
		db.payment.findMany({
			where: {
				organizationId,
				reviewedAt: null,
				freeAccount: false,
				stoppedAccount: false,
			},
			select: {
				paidAmount: true,
				accountPrice: true,
				discount: true,
				customer: {
					select: { iptvPrice: true, realIpPrice: true },
				},
			},
		}),
	]);
	const mismatches = mismatchCandidates.filter((p) => {
		const expected =
			p.accountPrice +
			(p.customer.iptvPrice ?? 0) +
			(p.customer.realIpPrice ?? 0) -
			p.discount;
		return Math.abs(p.paidAmount - expected) > 0.01;
	}).length;
	return flagged + mismatches;
}

export async function getBadgeCountForUser(userId: string): Promise<number> {
	const counts = await getUnreviewedCountsPerUser([userId]);
	return counts.get(userId) ?? 0;
}
