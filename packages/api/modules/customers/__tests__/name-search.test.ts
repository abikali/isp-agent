import { describe, expect, it } from "vitest";
import {
	consonantSkeleton,
	type NameSearchCandidate,
	normalizeSearchText,
	rankNameSearch,
	tokenizeSearchQuery,
} from "../lib/name-search";

function customer(
	id: string,
	firstName: string | null,
	lastName: string | null,
	username: string | null,
	extra: Partial<NameSearchCandidate> = {},
): NameSearchCandidate {
	return {
		id,
		firstName,
		lastName,
		username,
		status: "ACTIVE",
		online: false,
		...extra,
	};
}

function ids(query: string, candidates: NameSearchCandidate[]): string[] {
	return rankNameSearch(query, candidates).map((hit) => hit.candidate.id);
}

describe("normalizeSearchText", () => {
	it("lowercases, strips punctuation and collapses doubled letters", () => {
		expect(normalizeSearchText("  Ali HAJJ-Hassan ")).toBe("ali haj hasan");
		expect(normalizeSearchText("O'Neill")).toBe("o neil");
	});

	it("strips Latin accents", () => {
		expect(normalizeSearchText("Élie Gémayel")).toBe("elie gemayel");
	});

	it("unifies Arabic letter variants and drops tashkeel/tatweel", () => {
		expect(normalizeSearchText("أحمد")).toBe(normalizeSearchText("احمد"));
		expect(normalizeSearchText("إيمان")).toBe(normalizeSearchText("ايمان"));
		expect(normalizeSearchText("فاطمة")).toBe(normalizeSearchText("فاطمه"));
		expect(normalizeSearchText("مصطفى")).toBe(normalizeSearchText("مصطفي"));
		expect(normalizeSearchText("مُحَمَّد")).toBe(normalizeSearchText("محمد"));
		expect(normalizeSearchText("علـــي")).toBe("علي");
	});

	it("keeps digits intact (no collapse)", () => {
		expect(normalizeSearchText("user1100")).toBe("user1100");
	});
});

describe("tokenizeSearchQuery / consonantSkeleton", () => {
	it("tokenizes on anything non-alphanumeric", () => {
		expect(tokenizeSearchQuery("haj.hassan, ali")).toEqual([
			"haj",
			"hasan",
			"ali",
		]);
		expect(tokenizeSearchQuery("--- ")).toEqual([]);
	});

	it("makes vowel spelling variants meet", () => {
		expect(consonantSkeleton("mohamad")).toBe(consonantSkeleton("muhamad"));
		expect(consonantSkeleton("hasan")).toBe("hsn");
	});
});

describe("rankNameSearch", () => {
	const people = [
		customer("ali", "Ali", "Hajj Hassan", "alihajjhasan"),
		customer("hussein", "Hussein", "Al Hajj", "husseinalhaj"),
		customer("hassan-k", "Hassan", "Khalil", "hkhalil"),
		customer("ayman-u", "Karim", "Saad", "ayman12"),
		customer("ayman-n", "Ayman", "Tarraf", "atarraf"),
		customer("deleted", "Deleted User #812", null, null),
	];

	it("finds 'haj hassan' across spelling variants", () => {
		for (const query of ["haj hassan", "hajj hasan", "hassan haj"]) {
			const hits = rankNameSearch(query, people);
			expect(hits[0]?.candidate.id).toBe("ali");
			expect(hits[0]?.matchedOn).toBe("name");
			// Only one precise hit, so looser skeleton matches (Hussein Al
			// Hajj: h-s-n + h-j) are appended below it.
			expect(hits.slice(1).every((h) => h.matchedOn === "similar")).toBe(
				true,
			);
		}
	});

	it("matches usernames as well as names", () => {
		expect(ids("ayman", people).sort()).toEqual(["ayman-n", "ayman-u"]);
	});

	it("ranks exact username > username prefix > word start > substring", () => {
		const candidates = [
			customer("substring", "Mohassan", null, "mh1"),
			customer("word", "Hassan", "Zein", "hz"),
			customer("prefix", "X", null, "hassan99"),
			customer("exact", "Y", null, "hassan"),
		];
		const hits = rankNameSearch("hassan", candidates);
		expect(hits.map((h) => h.candidate.id)).toEqual([
			"exact",
			"prefix",
			"word",
			"substring",
		]);
		expect(hits.map((h) => h.score)).toEqual([100, 80, 60, 40]);
		expect(hits[0]?.matchedOn).toBe("username");
		expect(hits[2]?.matchedOn).toBe("name");
	});

	it("breaks ties with ACTIVE first, then online", () => {
		const candidates = [
			customer("inactive", "Rami", "A", "r1", { status: "INACTIVE" }),
			customer("offline", "Rami", "B", "r2"),
			customer("online", "Rami", "C", "r3", { online: true }),
		];
		expect(ids("rami", candidates)).toEqual([
			"online",
			"offline",
			"inactive",
		]);
	});

	it("excludes 'Deleted User' placeholders", () => {
		expect(ids("deleted user", people)).toEqual([]);
	});

	it("falls back to the consonant skeleton only when few precise hits", () => {
		const candidates = [
			customer("muhammad", "Muhammad", "Saleh", "msaleh"),
			customer("mohamad", "Mohamad", "Ali", "mali"),
		];
		const hits = rankNameSearch("mohammed", candidates);
		expect(hits.map((h) => h.candidate.id).sort()).toEqual([
			"mohamad",
			"muhammad",
		]);
		expect(hits.every((h) => h.matchedOn === "similar")).toBe(true);

		const many = [
			customer("a", "Rami", "A", "a"),
			customer("b", "Rami", "B", "b"),
			customer("c", "Rami", "C", "c"),
			customer("similar", "Rumi", "D", "d"),
		];
		expect(ids("rami", many)).not.toContain("similar");
	});

	it("does not let a one-consonant skeleton match everyone", () => {
		const candidates = [customer("x", "Layla", "Lahoud", "llahoud")];
		expect(ids("ali", candidates)).toEqual([]);
	});

	it("matches Arabic names regardless of hamza and taa marbuta", () => {
		const candidates = [customer("ar", "أحمد", "حمادة", null)];
		expect(ids("احمد حماده", candidates)).toEqual(["ar"]);
	});

	it("returns nothing for an empty query", () => {
		expect(rankNameSearch("  ", people)).toEqual([]);
	});
});
