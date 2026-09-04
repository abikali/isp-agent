import { db } from "@repo/database";
import { matchRule } from "../../finance/lib/classify";

/**
 * Apply the org's money map to a free-text description. Returns null when
 * nothing matches — an unclassified expense is reported as unclassified
 * rather than guessed into a bucket.
 */
export async function resolveBucketFromRules(
	organizationId: string,
	description: string,
): Promise<string | null> {
	const rules = await db.financeRule.findMany({
		where: { organizationId },
		select: {
			id: true,
			pattern: true,
			matchType: true,
			financeCategoryId: true,
			priority: true,
		},
	});
	return matchRule(description, rules)?.financeCategoryId ?? null;
}
