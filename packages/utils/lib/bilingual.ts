/**
 * "English · العربية" for field-crew copy (worker portal, worker Telegram,
 * worker-facing errors). The field team reads Arabic; admins read English,
 * so both sit on one line — same convention as the task category badges.
 *
 * The Arabic half is wrapped in first-strong isolates (U+2068 … U+2069) so
 * digits and Latin item names inside it keep their order when the line is
 * laid out left-to-right.
 */
export function bilingual(en: string, ar: string): string {
	return `${en} · ⁨${ar}⁩`;
}
