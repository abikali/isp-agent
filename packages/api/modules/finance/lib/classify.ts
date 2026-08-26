/**
 * Turning raw rows into classified money lines.
 *
 * Two jobs live here:
 *   1. Matching an expense description against the org's money-map rules.
 *   2. Detecting which spending lines are worth asking the owner about.
 *
 * Both are pure functions over plain data so they can be unit-tested without a
 * database and reused by the wizard, the approval path, and the P&L.
 */

/** Normalise a free-text description for grouping and matching.
 *
 * Strips amounts, punctuation and case so that "Energy bridge",
 * "energy bridge  ", and "Energy Bridge 2290$" all collapse to one line. Arabic
 * is left intact — a good third of these descriptions are Arabic and mangling
 * them would split every line in two. */
export function normaliseDescription(input: string): string {
	return input
		.toLowerCase()
		.replace(/[0-9]+([.,][0-9]+)?/g, " ")
		.replace(/[$€£]/g, " ")
		.replace(/[_\-–—.,;:!?()[\]{}"'`/\\|*+#@%&<>]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export interface RuleLike {
	id: string;
	pattern: string;
	matchType: string;
	financeCategoryId: string;
	priority: number;
}

/**
 * Find the bucket for a description.
 *
 * Highest priority wins; ties break on the longest pattern, so a specific rule
 * ("energy bridge taskir") beats a broad one ("energy") without the owner
 * having to think about ordering.
 */
export function matchRule<T extends RuleLike>(
	description: string,
	rules: T[],
): T | null {
	const haystack = normaliseDescription(description);
	if (!haystack) {
		return null;
	}

	let best: T | null = null;
	for (const rule of rules) {
		const needle = normaliseDescription(rule.pattern);
		if (!needle) {
			continue;
		}

		const hit =
			rule.matchType === "exact"
				? haystack === needle
				: rule.matchType === "startsWith"
					? haystack.startsWith(needle)
					: haystack.includes(needle);

		if (!hit) {
			continue;
		}
		if (
			!best ||
			rule.priority > best.priority ||
			(rule.priority === best.priority &&
				needle.length > normaliseDescription(best.pattern).length)
		) {
			best = rule;
		}
	}
	return best;
}

export interface ExpenseSample {
	description: string;
	amount: number;
	createdAt: Date;
	financeCategoryId: string | null;
}

export interface DetectedLine {
	/** Normalised key — also the rule pattern we would write. */
	key: string;
	/** The most readable original spelling seen for this line. */
	label: string;
	occurrences: number;
	total: number;
	monthlyAverage: number;
	/** Distinct calendar months this line appeared in. A line seen in 4 of 4
	 *  months is a standing commitment; one seen once is a one-off. */
	monthsSeen: number;
	largestSingle: number;
	lastSeen: Date;
	/** Already classified — shown in the wizard as confirmable, not as a question. */
	financeCategoryId: string | null;
}

/**
 * Group spending into the lines worth asking an owner about.
 *
 * The wizard must not present 175 rows. It must present the handful that
 * actually move the number — which in practice means recurring commitments and
 * anything individually large.
 *
 * Ranking is by total spend, because that is the order in which getting a
 * classification wrong costs the most.
 */
export function detectRecurringLines(
	samples: ExpenseSample[],
	opts: { minTotal?: number; minOccurrences?: number } = {},
): DetectedLine[] {
	const minTotal = opts.minTotal ?? 500;
	const minOccurrences = opts.minOccurrences ?? 2;

	const groups = new Map<
		string,
		{
			labels: Map<string, number>;
			total: number;
			occurrences: number;
			months: Set<string>;
			largest: number;
			lastSeen: Date;
			categoryIds: Set<string>;
		}
	>();

	for (const sample of samples) {
		const key = normaliseDescription(sample.description);
		if (!key) {
			continue;
		}
		let group = groups.get(key);
		if (!group) {
			group = {
				labels: new Map(),
				total: 0,
				occurrences: 0,
				months: new Set(),
				largest: 0,
				lastSeen: sample.createdAt,
				categoryIds: new Set(),
			};
			groups.set(key, group);
		}
		const trimmed = sample.description.trim();
		group.labels.set(trimmed, (group.labels.get(trimmed) ?? 0) + 1);
		group.total += sample.amount;
		group.occurrences += 1;
		group.months.add(
			`${sample.createdAt.getUTCFullYear()}-${sample.createdAt.getUTCMonth()}`,
		);
		group.largest = Math.max(group.largest, sample.amount);
		if (sample.createdAt > group.lastSeen) {
			group.lastSeen = sample.createdAt;
		}
		if (sample.financeCategoryId) {
			group.categoryIds.add(sample.financeCategoryId);
		}
	}

	const lines: DetectedLine[] = [];
	for (const [key, group] of groups) {
		const recurring = group.occurrences >= minOccurrences;
		const material = group.total >= minTotal;
		// A single large payment matters as much as a small repeated one.
		if (!recurring && !material) {
			continue;
		}

		let label = key;
		let bestCount = -1;
		for (const [text, count] of group.labels) {
			if (count > bestCount) {
				bestCount = count;
				label = text;
			}
		}

		lines.push({
			key,
			label,
			occurrences: group.occurrences,
			total: group.total,
			monthlyAverage: group.total / Math.max(1, group.months.size),
			monthsSeen: group.months.size,
			largestSingle: group.largest,
			lastSeen: group.lastSeen,
			financeCategoryId:
				group.categoryIds.size === 1
					? (group.categoryIds.values().next().value ?? null)
					: null,
		});
	}

	return lines.sort((a, b) => b.total - a.total);
}
