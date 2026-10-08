/**
 * Area key from an iRadius group name: "SABTIYE " → "sabtiye",
 * "sin el fil-" → "sin el fil". Fiber areas and leads are keyed on it.
 */
export function normalizeArea(
	groupName: string | null | undefined,
): string | null {
	const key = (groupName ?? "")
		.toLowerCase()
		.replace(/[\s-]+$/u, "")
		.replace(/^[\s-]+/u, "")
		.replace(/\s+/gu, " ");
	return key || null;
}
