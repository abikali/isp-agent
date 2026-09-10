import type { Prisma } from "@repo/database";
import { phoneSearchVariants } from "@repo/utils";

/**
 * Where-clauses that find a customer by ANY of his phone numbers.
 *
 * `mobile` only caches the primary number; the full list lives in the
 * `phones` JSON array. Every list search used to match `mobile`/`phone`
 * alone, so a customer reachable on his second number could not be found by
 * it (182 customers in the main org carry two numbers). Spread the result
 * into the existing `OR`.
 *
 * Only kicks in for terms that look like a phone (6+ digits after
 * stripping) so a name search is not slowed by JSON scans.
 */
export function phoneSearchClauses(
	search: string,
): Prisma.CustomerWhereInput[] {
	const digits = search.replace(/\D/g, "");
	if (digits.length < 6) {
		return [];
	}
	const variants = phoneSearchVariants(search);
	return [
		...variants.map(
			(v) => ({ phones: { array_contains: [{ number: v }] } }) as const,
		),
		// Legacy/imported rows keep only `mobile` (national digits) — keep
		// the substring match on the cached column too.
		{ mobile: { contains: digits, mode: "insensitive" } },
	];
}
