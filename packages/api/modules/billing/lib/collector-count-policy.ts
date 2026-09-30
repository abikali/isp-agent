import { db } from "@repo/database";
import type { CustomerSettlementRow } from "./queries";

/**
 * Does a free / stopped bill count toward a collector's "Collected Bills"
 * tally (what the owner settles with each collector at month end)? Counts
 * only — cash figures never change, and nothing is written to iRadius.
 *
 * Org default (`Organization.collectorCountsFree` / `collectorCountsStop`),
 * overridable per collector (`Employee.countsFreeOverride` /
 * `countsStopOverride`, null = inherit). Defaults keep the historic numbers:
 * free counts, stop doesn't.
 */
export interface CountPolicy {
	free: boolean;
	stop: boolean;
}

export function resolveCountPolicy(
	org: { collectorCountsFree: boolean; collectorCountsStop: boolean },
	collector?: {
		countsFreeOverride: boolean | null;
		countsStopOverride: boolean | null;
	} | null,
): CountPolicy {
	return {
		free: collector?.countsFreeOverride ?? org.collectorCountsFree,
		stop: collector?.countsStopOverride ?? org.collectorCountsStop,
	};
}

/**
 * Collected ⟺ cash covered the active month, or it was waived free / stopped
 * and the policy counts that. A partial month never counts.
 */
export function countsAsCollected(
	row: Pick<
		CustomerSettlementRow,
		"activeCashSettled" | "activeFree" | "activeStopped"
	>,
	policy: CountPolicy,
): boolean {
	return (
		row.activeCashSettled ||
		(row.activeFree && policy.free) ||
		(row.activeStopped && policy.stop)
	);
}

/**
 * Load the org default plus every collector override, returning a resolver.
 * Rows without a collector use the org default.
 */
export async function loadCountPolicies(
	organizationId: string,
): Promise<(collectorId: string | null) => CountPolicy> {
	const [org, overrides] = await Promise.all([
		db.organization.findUnique({
			where: { id: organizationId },
			select: { collectorCountsFree: true, collectorCountsStop: true },
		}),
		db.employee.findMany({
			where: {
				organizationId,
				OR: [
					{ countsFreeOverride: { not: null } },
					{ countsStopOverride: { not: null } },
				],
			},
			select: {
				id: true,
				countsFreeOverride: true,
				countsStopOverride: true,
			},
		}),
	]);
	const orgDefaults = {
		collectorCountsFree: org?.collectorCountsFree ?? true,
		collectorCountsStop: org?.collectorCountsStop ?? false,
	};
	const byId = new Map(overrides.map((e) => [e.id, e]));
	return (collectorId) =>
		resolveCountPolicy(
			orgDefaults,
			collectorId ? byId.get(collectorId) : null,
		);
}
