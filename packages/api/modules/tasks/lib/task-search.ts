import type { Prisma } from "@repo/database";
import {
	customerIdsByPhone,
	customerSearchWhere,
	customerTokenWhere,
	looksLikePhone,
	type PhoneIdLookup,
	tokensWithPhoneIds,
} from "../../customers/lib/customer-search";

/** Tokens beyond this are ignored — each one adds a join-heavy OR. */
const MAX_TOKENS = 10;

/**
 * Task where-clause for a free-text search box (tasks list, worker portal,
 * escalations, command palette).
 *
 * Billing-sync tasks are titled "Maintenance #2907" with no customer name, so
 * matching title/description alone misses what people actually type:
 *
 * - Phone-shaped → tasks whose customer owns a matching number (any stored
 *   shape, any of their numbers — see `customerSearchWhere`), or whose text
 *   contains the query.
 * - Otherwise → every token (with a leading `#` dropped, so "#2907" works)
 *   must match one of: title, description, notes, the customer's name /
 *   username / account / phone, base, station, an assigned worker, or the
 *   worker who completed it. A 4-character token also matches the task code
 *   (last 4 of the id) for tasks whose title predates the code suffix, and
 *   a phone-shaped token also matches any of the customer's numbers
 *   ("takla 81394966").
 *
 * Soft-deleted customers are deliberately NOT excluded — they still own their
 * old tasks. Returns null for an empty query. Callers AND the result into
 * their where (never assign it over an existing `OR`).
 */
export async function taskSearchWhere(
	organizationId: string,
	query: string,
	lookup: PhoneIdLookup = (q) => customerIdsByPhone(organizationId, q),
): Promise<Prisma.TaskWhereInput | null> {
	const trimmed = query.trim();
	if (trimmed.length === 0) {
		return null;
	}

	if (looksLikePhone(trimmed)) {
		return {
			OR: [
				...textWhere(trimmed),
				{
					customer: await customerSearchWhere(
						organizationId,
						trimmed,
						lookup,
					),
				},
			],
		};
	}

	const tokens = trimmed
		.split(/\s+/)
		.map((t) => t.replace(/^#+/, ""))
		.filter(Boolean)
		.slice(0, MAX_TOKENS);
	if (tokens.length === 0) {
		return null;
	}
	const resolved = await tokensWithPhoneIds(tokens, lookup);
	return {
		AND: resolved.map(({ token, phoneIds }) =>
			taskTokenWhere(token, phoneIds),
		),
	};
}

/** One search token against a task's own text and everything it points at. */
export function taskTokenWhere(
	token: string,
	phoneIds?: string[],
): Prisma.TaskWhereInput {
	const contains = { contains: token, mode: "insensitive" } as const;
	const or: Prisma.TaskWhereInput[] = [...textWhere(token)];
	// Single characters would match nearly every related row — keep them to
	// the task's own text.
	if (token.length >= 2) {
		or.push(
			{ customer: customerTokenWhere(token, phoneIds) },
			{ base: { name: contains } },
			{ station: { name: contains } },
			{ assignments: { some: { employee: { name: contains } } } },
			{ completedByEmployee: { name: contains } },
		);
	}
	if (/^[a-z0-9]{4}$/i.test(token)) {
		or.push({ id: { endsWith: token.toLowerCase() } });
	}
	return { OR: or };
}

function textWhere(value: string): Prisma.TaskWhereInput[] {
	const contains = { contains: value, mode: "insensitive" } as const;
	return [
		{ title: contains },
		{ description: contains },
		{ notes: contains },
	];
}
