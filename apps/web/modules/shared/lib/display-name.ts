export function displayName(
	firstName?: string | null,
	lastName?: string | null,
	options: { fallback?: string } = {},
): string {
	return (
		[firstName, lastName].filter(Boolean).join(" ") ||
		options.fallback ||
		"Unknown"
	);
}
