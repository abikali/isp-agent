export function displayName(
	firstName?: string | null,
	lastName?: string | null,
): string {
	return [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
}
