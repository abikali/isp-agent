import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@repo/jobs", () => ({
	getRedisConnection: () => ({
		scan: async (_cursor: string, _match: string, pattern: string) => {
			const prefix = pattern.replace(/\*$/, "");
			return ["0", [...store.keys()].filter((k) => k.startsWith(prefix))];
		},
		del: async (...keys: string[]) => {
			for (const key of keys) {
				store.delete(key);
			}
			return keys.length;
		},
	}),
}));

import { statCacheKey } from "@repo/api/lib/stat-cache";
import { bustTaskStats, TASK_STATS_CACHE } from "../lib/stats-cache";

/** The Redis key `tasks.stats` caches under for this scope (see stats.ts). */
function cachedKey(
	organizationId: string,
	activeDealerId: string | null,
	sources?: string[],
): string {
	return `statcache:${statCacheKey(TASK_STATS_CACHE, [
		organizationId,
		activeDealerId,
		sources,
	])}`;
}

async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	store.clear();
});

describe("bustTaskStats", () => {
	it("drops every cached tasks.stats entry of the organization", async () => {
		const sidebar = cachedKey("org1", "dealerA", ["MANUAL", "LEGACY"]);
		const unfiltered = cachedKey("org1", "dealerB");
		const escalations = cachedKey("org1", "dealerA", ["AI_ESCALATION"]);
		for (const key of [sidebar, unfiltered, escalations]) {
			store.set(key, "{}");
		}

		bustTaskStats("org1");
		await flush();

		expect(store.size).toBe(0);
	});

	it("leaves other organizations and other stats alone", async () => {
		const otherOrg = cachedKey("org2", "dealerA", ["MANUAL", "LEGACY"]);
		// Shares "org1" as a string prefix — the scope separator must keep
		// it out of org1's bust.
		const lookalikeOrg = cachedKey("org10", "dealerA");
		const otherStat = `statcache:${statCacheKey("expenses/stats", ["org1"])}`;
		for (const key of [otherOrg, lookalikeOrg, otherStat]) {
			store.set(key, "{}");
		}

		bustTaskStats("org1");
		await flush();

		expect([...store.keys()].sort()).toEqual(
			[otherOrg, lookalikeOrg, otherStat].sort(),
		);
	});
});
