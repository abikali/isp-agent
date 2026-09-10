import { describe, expect, it } from "vitest";
import { phoneSearchClauses } from "../lib/phone-search";

describe("phoneSearchClauses", () => {
	it("does nothing for a name", () => {
		expect(phoneSearchClauses("zeid hanna")).toEqual([]);
	});

	it("matches the phones array on every variant of a Lebanese number", () => {
		const clauses = phoneSearchClauses("76547175");
		const contained = clauses
			.filter((c) => "phones" in c)
			.map(
				(c) =>
					(
						c as {
							phones: {
								array_contains: Array<{ number: string }>;
							};
						}
					).phones.array_contains[0]?.number,
			);
		expect(contained).toEqual(
			expect.arrayContaining(["+96176547175", "76547175"]),
		);
		expect(clauses.at(-1)).toEqual({
			mobile: { contains: "76547175", mode: "insensitive" },
		});
	});

	it("strips formatting before deciding it is a phone", () => {
		expect(phoneSearchClauses("+961 76 547 175").length).toBeGreaterThan(0);
	});
});
