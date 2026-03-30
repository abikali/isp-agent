/**
 * Prisma filter fragments for billing queries.
 *
 * Prisma's `NOT: { field: { equals: X } }` silently excludes rows
 * where the field is NULL. These helpers encode the correct OR pattern.
 */

/**
 * Exclude customers whose groupName matches a value (case-insensitive),
 * while keeping customers with NULL groupName.
 */
export function excludeGroupFilter(groupName: string) {
	return {
		OR: [
			{ groupName: null },
			{
				NOT: {
					groupName: {
						equals: groupName,
						mode: "insensitive" as const,
					},
				},
			},
		],
	};
}

/** Hardcoded filter for the most common case: exclude "free" group. */
export const EXCLUDE_FREE_GROUP = excludeGroupFilter("free");

/**
 * Case-insensitive search across common customer fields.
 * Returns a Prisma OR clause matching firstName, lastName, username, or mobile.
 */
export function customerSearchFilter(search: string) {
	return {
		OR: [
			{ firstName: { contains: search, mode: "insensitive" as const } },
			{ lastName: { contains: search, mode: "insensitive" as const } },
			{ username: { contains: search, mode: "insensitive" as const } },
			{ mobile: { contains: search, mode: "insensitive" as const } },
		],
	};
}
