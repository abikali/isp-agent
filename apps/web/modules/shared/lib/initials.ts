/**
 * Gets initials from firstName and optional lastName.
 * Takes the first letter of each and uppercases them.
 *
 * @example
 * getInitials("John", "Doe") // "JD"
 * getInitials("Alice") // "A"
 * getInitials("Alice", undefined) // "A"
 * getInitials("", "") // ""
 * getInitials(undefined) // ""
 */
export function getInitials(
	firstName: string | null | undefined,
	lastName?: string | null,
): string {
	const firstInitial = firstName?.trim()?.[0] || "";
	const lastInitial = lastName?.trim()?.[0] || "";

	return (firstInitial + lastInitial).toUpperCase();
}
