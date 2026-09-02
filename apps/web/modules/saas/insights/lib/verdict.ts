/**
 * Turning the month's numbers into one sentence a person can act on.
 *
 * The old billing overview showed six metric cards and a red "Net total". The
 * owner's actual question — "am I OK?" — was left for him to compute from six
 * figures, in a vocabulary ("handed off", "grand total") that came from the
 * cash ledger rather than from his business.
 *
 * So the page leads with a sentence. Everything else on it is evidence for that
 * sentence.
 *
 * Rules this file exists to enforce:
 *   · Never state a conclusion the data cannot support. A part-month is called
 *     a part-month; unclassified spending downgrades confidence rather than
 *     being silently ignored.
 *   · Never use a word an owner would not use. No "net", no "margin", no
 *     "operating profit" in the headline.
 *   · Always answer "compared to what?" in the same breath.
 */

export type VerdictTone = "good" | "steady" | "watch" | "bad" | "unknown";

export interface VerdictInput {
	periodLabel: string;
	isPartial: boolean;
	progress: number;
	moneyIn: number;
	moneyOut: number;
	net: number;
	comparisonLabel: string;
	comparisonNet: number;
	comparisonMoneyIn: number;
	unclassifiedShare: number;
	/** Set when a whole income stream is invisible (e.g. the dealer sync has
	 *  never run). The page must not publish a verdict it knows is incomplete. */
	incomeStreamMissing?: boolean;
}

export interface Verdict {
	tone: VerdictTone;
	/** The headline. One sentence, no numbers over four digits unformatted. */
	headline: string;
	/** The "compared to what" line. Optional — omitted when there is no
	 *  honest comparison to draw. */
	detail: string | null;
	/** Shown only when something would make the headline misleading. */
	caveat: string | null;
}

function money(value: number): string {
	const rounded = Math.round(Math.abs(value));
	return `$${rounded.toLocaleString("en-US")}`;
}

/**
 * Scale a part-month figure to a whole month so it can be compared fairly.
 *
 * Only used for the comparison sentence, never for a displayed total — showing
 * a projected number as if it were banked is exactly the kind of confident
 * wrongness this whole project exists to remove.
 */
function projected(value: number, progress: number): number {
	if (progress <= 0.05) {
		return value;
	}
	return value / progress;
}

/** Below this share of the period, the pace comparison is withheld. */
const EARLIEST_COMPARABLE_PROGRESS = 0.15;

export function buildVerdict(input: VerdictInput): Verdict {
	const {
		periodLabel,
		isPartial,
		progress,
		moneyIn,
		moneyOut,
		net,
		comparisonLabel,
		comparisonNet,
		unclassifiedShare,
	} = input;

	// A whole income stream is missing. Any verdict here would be arithmetic on
	// half the truth — which is precisely the failure this page replaced, where
	// wholesale income was absent while every cost of serving it was counted.
	// Say so instead of guessing.
	if (input.incomeStreamMissing) {
		return {
			tone: "unknown",
			headline: "We can't show your full picture yet.",
			detail: "Income from dealers reselling your service hasn't been brought in yet, so anything we showed here would be missing about half of what you earn.",
			caveat: "Run a sync from Settings → iRadius and this page will fill in.",
		};
	}

	// Nothing to say yet. Better than a confident $0.
	if (moneyIn === 0 && moneyOut === 0) {
		return {
			tone: "unknown",
			headline: `No money recorded for ${periodLabel} yet.`,
			detail: null,
			caveat: null,
		};
	}

	const caveat =
		unclassifiedShare > 0.05
			? `${Math.round(unclassifiedShare * 100)}% of your spending isn't sorted into a category yet, so this could move.`
			: null;

	const losing = net < 0;
	const timing = isPartial ? `${periodLabel} so far` : periodLabel;

	// ── The headline ────────────────────────────────────────────────
	let headline: string;
	let tone: VerdictTone;

	if (losing) {
		headline = `In ${timing} you spent ${money(Math.abs(net))} more than you took in.`;
		tone = "bad";
	} else if (net === 0) {
		headline = `In ${timing} you broke even.`;
		tone = "steady";
	} else {
		headline = `In ${timing} you kept ${money(net)}.`;
		tone = "good";
	}

	// ── Compared to what ────────────────────────────────────────────
	let detail: string | null = null;

	if (comparisonNet === 0 && net !== 0) {
		detail = `There's nothing recorded for ${comparisonLabel} to compare against.`;
	} else if (isPartial && progress < EARLIEST_COMPARABLE_PROGRESS) {
		// Two days of collections scaled to a month is not a pace, it is a
		// coin toss. Saying "$1,865 less than August" on the 2nd was read as a
		// real drop. Wait until enough of the month exists to project from.
		detail = `Too early to compare with ${comparisonLabel} — check back in a few days.`;
		if (!losing) {
			tone = "steady";
		}
	} else if (comparisonNet !== 0) {
		// Compare like with like: a part-month is projected to a full month for
		// the COMPARISON only, and the sentence says so.
		const basis = isPartial ? projected(net, progress) : net;
		const change = basis - comparisonNet;
		const pct = Math.abs(change / Math.abs(comparisonNet));

		const pace = isPartial ? "At this pace, that's" : "That's";

		if (pct < 0.08) {
			detail = `${pace} about the same as ${comparisonLabel}.`;
			if (!losing) {
				tone = "steady";
			}
		} else if (change > 0) {
			detail = `${pace} ${money(change)} better than ${comparisonLabel}.`;
			if (!losing) {
				tone = "good";
			}
		} else {
			detail = `${pace} ${money(change)} less than ${comparisonLabel}.`;
			// A shrinking but still-positive month is a "watch", not a "bad".
			if (!losing) {
				tone = pct > 0.25 ? "watch" : "steady";
			}
		}
	}

	return { tone, headline, detail, caveat };
}

/**
 * A short, honest label for how far into the period we are.
 * Used next to the headline so nobody reads a 3-day month as a full one.
 */
export function progressNote(
	isPartial: boolean,
	from: string,
	now = new Date(),
): string | null {
	if (!isPartial) {
		return null;
	}
	const start = new Date(from);
	const days = Math.max(
		1,
		Math.round((now.getTime() - start.getTime()) / 86_400_000),
	);
	return days === 1 ? "1 day in" : `${days} days in`;
}
