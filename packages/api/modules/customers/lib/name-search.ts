/**
 * Fuzzy customer lookup by name / username for the Telegram ISP bot.
 *
 * Staff type names the way they sound ("haj hassan") while the data holds
 * every spelling variant ("Ali Hajj Hasan", username `alihajjhasan`,
 * "al hajj", Arabic script with or without tashkeel). Postgres has no
 * pg_trgm/unaccent here, so matching is done on a narrow candidate list in
 * memory — one org is a few thousand rows.
 *
 * Tiers, best first:
 *   exact username (100) > username prefix (80) > every token starts a word
 *   (60) > every token is a substring (40) > consonant-skeleton match (20).
 * Skeleton matches are only added when the substring tiers find fewer than
 * `SKELETON_THRESHOLD` customers, so a precise query is not drowned.
 */

export type NameMatchKind = "username" | "name" | "similar";

export interface NameSearchCandidate {
	id: string;
	firstName: string | null;
	lastName: string | null;
	username: string | null;
	status: string;
	online: boolean;
}

export interface NameSearchHit<T extends NameSearchCandidate> {
	candidate: T;
	score: number;
	matchedOn: NameMatchKind;
}

export const SKELETON_THRESHOLD = 3;
export const MAX_QUERY_TOKENS = 6;

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g;
const LATIN_VOWELS = /[aeiouy]/g;
const ARABIC_LONG_VOWELS = /[اوي]/g;

/**
 * Lowercase, strip Latin accents and Arabic tashkeel/tatweel, unify Arabic
 * letter variants, turn everything that is not a letter/digit into a space,
 * and collapse doubled letters ("hajj" → "haj", "hassan" → "hasan").
 */
export function normalizeSearchText(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(ARABIC_DIACRITICS, "")
		.replace(/[أإآٱ]/g, "ا")
		.replace(/ة/g, "ه")
		.replace(/ى/g, "ي")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.replace(/(\p{L})\1+/gu, "$1")
		.trim()
		.replace(/\s+/g, " ");
}

/** Normalised query tokens (empty when nothing searchable is left). */
export function tokenizeSearchQuery(query: string): string[] {
	const normalized = normalizeSearchText(query);
	return normalized ? normalized.split(" ") : [];
}

/** Vowel-less form so "hasan"/"hassan"/"hsn" and "mohammad"/"muhammad" meet. */
export function consonantSkeleton(value: string): string {
	return value
		.replace(LATIN_VOWELS, "")
		.replace(ARABIC_LONG_VOWELS, "")
		.replace(/(\p{L})\1+/gu, "$1");
}

/** iRadius placeholders left behind for removed accounts ("Deleted User #123"). */
export function isDeletedPlaceholder(candidate: NameSearchCandidate): boolean {
	const name = normalizeSearchText(
		`${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`,
	);
	return name.startsWith("deleted user");
}

interface PreparedCandidate {
	words: string[];
	nameCompact: string;
	username: string;
}

function prepare(candidate: NameSearchCandidate): PreparedCandidate {
	const name = normalizeSearchText(
		`${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`,
	);
	const username = normalizeSearchText(candidate.username ?? "").replace(
		/ /g,
		"",
	);
	return {
		words: name ? name.split(" ") : [],
		nameCompact: name.replace(/ /g, ""),
		username,
	};
}

function scoreCandidate(
	tokens: string[],
	prepared: PreparedCandidate,
): { score: number; matchedOn: NameMatchKind } | null {
	const { words, nameCompact, username } = prepared;
	const queryCompact = tokens.join("");

	if (username && username === queryCompact) {
		return { score: 100, matchedOn: "username" };
	}
	if (username.startsWith(queryCompact)) {
		return { score: 80, matchedOn: "username" };
	}

	const startsWord = tokens.every(
		(token) =>
			words.some((word) => word.startsWith(token)) ||
			username.startsWith(token),
	);
	if (startsWord) {
		return { score: 60, matchedOn: "name" };
	}

	const inName = tokens.every((token) => nameCompact.includes(token));
	if (inName) {
		return { score: 40, matchedOn: "name" };
	}
	const inAny = tokens.every(
		(token) => nameCompact.includes(token) || username.includes(token),
	);
	if (inAny) {
		const inUsername = tokens.every((token) => username.includes(token));
		return { score: 40, matchedOn: inUsername ? "username" : "name" };
	}
	return null;
}

function matchesSkeleton(
	tokens: string[],
	prepared: PreparedCandidate,
): boolean {
	const nameSkeleton = consonantSkeleton(prepared.nameCompact);
	const usernameSkeleton = consonantSkeleton(prepared.username);
	return tokens.every((token) => {
		const skeleton = consonantSkeleton(token);
		// A one-consonant skeleton ("ali" → "l") would match half the org.
		if (skeleton.length < 2) {
			return (
				prepared.nameCompact.includes(token) ||
				prepared.username.includes(token)
			);
		}
		return (
			nameSkeleton.includes(skeleton) ||
			usernameSkeleton.includes(skeleton)
		);
	});
}

function compareHits<T extends NameSearchCandidate>(
	a: NameSearchHit<T>,
	b: NameSearchHit<T>,
): number {
	if (a.score !== b.score) {
		return b.score - a.score;
	}
	const aActive = a.candidate.status === "ACTIVE" ? 1 : 0;
	const bActive = b.candidate.status === "ACTIVE" ? 1 : 0;
	if (aActive !== bActive) {
		return bActive - aActive;
	}
	if (a.candidate.online !== b.candidate.online) {
		return a.candidate.online ? -1 : 1;
	}
	const aName = `${a.candidate.lastName ?? ""} ${a.candidate.firstName ?? ""}`;
	const bName = `${b.candidate.lastName ?? ""} ${b.candidate.firstName ?? ""}`;
	return aName.localeCompare(bName);
}

/** Rank every candidate matching the query; placeholders are dropped. */
export function rankNameSearch<T extends NameSearchCandidate>(
	query: string,
	candidates: T[],
): NameSearchHit<T>[] {
	const tokens = tokenizeSearchQuery(query);
	if (tokens.length === 0) {
		return [];
	}

	const hits: NameSearchHit<T>[] = [];
	const misses: { candidate: T; prepared: PreparedCandidate }[] = [];
	for (const candidate of candidates) {
		if (isDeletedPlaceholder(candidate)) {
			continue;
		}
		const prepared = prepare(candidate);
		const result = scoreCandidate(tokens, prepared);
		if (result) {
			hits.push({ candidate, ...result });
		} else {
			misses.push({ candidate, prepared });
		}
	}

	if (hits.length < SKELETON_THRESHOLD) {
		for (const { candidate, prepared } of misses) {
			if (matchesSkeleton(tokens, prepared)) {
				hits.push({ candidate, score: 20, matchedOn: "similar" });
			}
		}
	}

	return hits.sort(compareHits);
}
