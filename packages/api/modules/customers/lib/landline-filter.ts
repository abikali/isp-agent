/**
 * The three answers to "does the customer have a landline?" as filters —
 * customer list, marketing audiences, the customer form. Browser-safe.
 */
export const LANDLINE_FILTERS = ["yes", "no", "unknown"] as const;
export type LandlineFilter = (typeof LANDLINE_FILTERS)[number];

export const LANDLINE_FILTER_LABELS: Record<LandlineFilter, string> = {
	yes: "Has landline",
	no: "No landline",
	unknown: "Not asked yet",
};

/** Prisma `where` fragment; "unknown" = the collector never asked. */
export function landlineWhere(filter: LandlineFilter): {
	hasLandline: boolean | null;
} {
	return { hasLandline: filter === "unknown" ? null : filter === "yes" };
}
