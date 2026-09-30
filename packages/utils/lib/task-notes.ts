/** Appends a note below a task's existing notes. */
export function appendTaskNote(existing: string | null, note: string): string {
	const trimmed = existing?.trim();
	return trimmed ? `${trimmed}\n\n${note}` : note;
}
