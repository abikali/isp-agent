import type { InterfacePeer } from "@repo/ai/isp-search-customer";
import { getDealerScopeFilter } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { queryIRadiusExpiryByUsernames } from "@repo/database/iradius";
import { logger } from "@repo/logs";

export interface DiagnosePeer {
	userName: string;
	online: boolean;
	name: string | null;
	customerId: string | null;
	expiresAt: string | null;
	expired: boolean;
}

/**
 * Peers from the live report, enriched the way the Telegram bot shows them:
 * a name and link for customers in the viewer's dealer scope, and an expired
 * flag from iRadius' live `ExpiryAccount` (not the local copy, which only the
 * full sync refreshes). Falls back to the local `expiresAt` when iRadius
 * can't be read. Sorted Online > Expired > Offline.
 */
export async function enrichDiagnosePeers(opts: {
	organizationId: string;
	activeDealerId: string | null;
	peers: InterfacePeer[];
	now?: Date;
}): Promise<DiagnosePeer[]> {
	const usernames = opts.peers.map((p) => p.userName).filter(Boolean);
	if (usernames.length === 0) {
		return [];
	}
	const now = opts.now ?? new Date();

	const [customers, liveExpiry] = await Promise.all([
		db.customer.findMany({
			where: {
				organizationId: opts.organizationId,
				username: { in: usernames },
				deletedAt: null,
				...getDealerScopeFilter(opts.activeDealerId),
			},
			select: {
				id: true,
				username: true,
				firstName: true,
				lastName: true,
				expiresAt: true,
			},
		}),
		queryIRadiusExpiryByUsernames(usernames).catch((error: unknown) => {
			logger.warn("[Diagnose] live expiry read failed, using local", {
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}),
	]);
	const byUsername = new Map(customers.map((c) => [c.username, c]));

	const rank = (p: DiagnosePeer) => (p.online ? 0 : p.expired ? 1 : 2);
	return opts.peers
		.map((peer) => {
			const local = byUsername.get(peer.userName);
			const expiresAt = liveExpiry?.has(peer.userName)
				? (liveExpiry.get(peer.userName) ?? null)
				: (local?.expiresAt ?? null);
			const name = [local?.firstName, local?.lastName]
				.map((part) => part?.trim())
				.filter(Boolean)
				.join(" ");
			return {
				userName: peer.userName,
				online: peer.online === true,
				name: name || null,
				customerId: local?.id ?? null,
				expiresAt: expiresAt?.toISOString() ?? null,
				expired: expiresAt !== null && expiresAt < now,
			};
		})
		.sort((a, b) => rank(a) - rank(b));
}
