/**
 * Render a simple `{{variable}}` template. Unknown or null/undefined variables
 * render as an empty string. No logic, no escaping — SMS is plain text.
 */
export function renderTemplate(
	template: string,
	vars: Record<string, string | number | null | undefined>,
): string {
	// Unicode-aware token match: allows Arabic letters/digits plus underscore and
	// internal spaces (e.g. `{{رقم العقار}}`), while still matching ASCII
	// tokens like `{{phone}}`. The lazy `+?` + trimming keeps the key free of
	// the surrounding whitespace.
	return template.replace(
		/\{\{\s*([\p{L}\p{N}_ ]+?)\s*\}\}/gu,
		(_match, key: string) => {
			const value = vars[key];
			return value === null || value === undefined ? "" : String(value);
		},
	);
}
