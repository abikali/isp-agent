import { db, type Prisma } from "@repo/database";
import { toNationalDigits } from "@repo/utils";

/**
 * Shared "find a customer" search used by every customer-facing search box
 * (customers list, pickers, collector unpaid list, payments, stopped,
 * invoices, installations, follow-ups, command palette).
 *
 * Phones are stored in every historical shape — `+961…`, bare national,
 * leading `0`, foreign, and a handful with spaces/slashes — and a customer's
 * numbers live in the `phones` JSON array (`mobile` only caches the primary).
 * Exact-variant matching misses most of that, so a phone-shaped query is
 * resolved by comparing digits only: every stored number is stripped to its
 * digits and must contain the query's national digits.
 */

/** Minimum digits before a query is treated as a phone number. */
const PHONE_MIN_DIGITS = 6;

/** Cap on ids a phone query may resolve to — the query is a substring match. */
const PHONE_ID_LIMIT = 1000;

/**
 * True for queries made only of phone punctuation (`+`, spaces, `-`, `/`,
 * parentheses) around at least 6 digits. Dots are excluded so an IP address
 * is never mistaken for a phone.
 */
export function looksLikePhone(query: string): boolean {
	const trimmed = query.trim();
	if (!/^[\d\s+\-()/]+$/.test(trimmed)) {
		return false;
	}
	return trimmed.replace(/\D/g, "").length >= PHONE_MIN_DIGITS;
}

/**
 * Digits a stored number must contain to match a phone-shaped query: the
 * bare national number (no country code, no leading 0), so `+961 81 394 966`,
 * `081394966`, `0096181394966` and `81394966` all find the same customer,
 * and a partial like `394966` still matches.
 */
export function phoneSearchDigits(query: string): string {
	return toNationalDigits(query.trim());
}

/** One search token against the customer's identifying fields. */
export function customerTokenWhere(token: string): Prisma.CustomerWhereInput {
	return {
		OR: [
			{ firstName: { contains: token, mode: "insensitive" } },
			{ lastName: { contains: token, mode: "insensitive" } },
			{ username: { contains: token, mode: "insensitive" } },
			{ accountNumber: { contains: token, mode: "insensitive" } },
			{ mobile: { contains: token, mode: "insensitive" } },
			{ phone: { contains: token, mode: "insensitive" } },
		],
	};
}

/**
 * Ids of the org's customers with ANY number (`mobile`, `phone`, or an entry
 * of `phones`) whose digits contain the query's national digits.
 */
export async function customerIdsByPhone(
	organizationId: string,
	query: string,
): Promise<string[]> {
	const digits = phoneSearchDigits(query);
	if (digits.length === 0) {
		return [];
	}
	const pattern = `%${digits}%`;
	const rows = await db.$queryRaw<{ id: string }[]>`
		SELECT c.id
		FROM "customer" c
		WHERE c."organizationId" = ${organizationId}
		  AND (
			regexp_replace(coalesce(c.mobile, ''), '\\D', '', 'g') LIKE ${pattern}
			OR regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g') LIKE ${pattern}
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					CASE WHEN jsonb_typeof(c.phones) = 'array' THEN c.phones ELSE '[]'::jsonb END
				) AS p
				WHERE regexp_replace(coalesce(p->>'number', ''), '\\D', '', 'g') LIKE ${pattern}
			)
		  )
		LIMIT ${PHONE_ID_LIMIT}
	`;
	return rows.map((r) => r.id);
}

/**
 * Customer where-clause for a free-text search.
 *
 * - Phone-shaped → customers owning a matching number (digits-only, any
 *   stored shape, any of their numbers), or whose username / account number
 *   contains the query (numeric usernames).
 * - Otherwise → every whitespace token must match one of name, username,
 *   account number or phone, so "michell takla" finds first + last name.
 *
 * Callers AND this into their own where (never assign it over an existing
 * `OR`).
 */
export async function customerSearchWhere(
	organizationId: string,
	query: string,
): Promise<Prisma.CustomerWhereInput> {
	const trimmed = query.trim();
	if (looksLikePhone(trimmed)) {
		const ids = await customerIdsByPhone(organizationId, trimmed);
		return {
			OR: [
				{ id: { in: ids } },
				{ username: { contains: trimmed, mode: "insensitive" } },
				{ accountNumber: { contains: trimmed, mode: "insensitive" } },
			],
		};
	}
	const tokens = trimmed.split(/\s+/).filter(Boolean).slice(0, 10);
	return { AND: tokens.map(customerTokenWhere) };
}
