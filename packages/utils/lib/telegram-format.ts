/**
 * Helpers for building rich Telegram notification messages with
 * `parse_mode: "HTML"`.
 *
 * Telegram HTML supports a small tag set: `<b> <i> <u> <s> <a href> <code>
 * <pre> <blockquote>`. We lean on `<code>`, which renders monospace AND is
 * tap-to-copy in the Telegram clients — perfect for usernames, account
 * numbers, phone numbers, and amounts an admin wants to paste elsewhere.
 *
 * Always run dynamic values (names, notes, addresses) through `tgEscape`
 * before interpolating: an unescaped `<` or `&` makes Telegram reject the
 * whole message with "can't parse entities". The helpers here escape for you;
 * only raw template strings you assemble by hand need manual care.
 */

/** HTML-escape a value for safe interpolation into a Telegram HTML message. */
export function tgEscape(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

/** Bold text (escaped). */
export function tgBold(value: string): string {
	return `<b>${tgEscape(value)}</b>`;
}

/** Italic text (escaped). */
export function tgItalic(value: string): string {
	return `<i>${tgEscape(value)}</i>`;
}

/**
 * Monospace text that is tap-to-copy in Telegram clients. Use for any value
 * the recipient is likely to paste elsewhere: username, account number,
 * phone, amount.
 */
export function tgCopyable(value: string): string {
	return `<code>${tgEscape(value)}</code>`;
}

/** A labelled hyperlink (both label and URL escaped). */
export function tgLink(label: string, url: string): string {
	return `<a href="${tgEscape(url)}">${tgEscape(label)}</a>`;
}

export interface TgField {
	/** Leading emoji/icon, e.g. "👤". */
	icon?: string;
	/** Bold label shown before the value, e.g. "Plan". Omit for a bare line. */
	label?: string;
	/** The value to display. Always escaped (or wrapped in <code> when copyable). */
	value: string;
	/** Render the value as tap-to-copy monospace. */
	copyable?: boolean;
}

export interface TgMessageInput {
	/** Headline emoji/icon, e.g. "🆕". */
	icon?: string;
	/** Bold headline. */
	title: string;
	/**
	 * Body lines. Falsy entries are dropped, so call sites can inline
	 * conditionals: `cond ? { label: "Note", value: x } : null`.
	 */
	fields?: (TgField | null | undefined | false)[];
	/**
	 * Trailing line(s). Already-built HTML (use `tgLink`, `tgItalic`, …) — NOT
	 * escaped, so don't pass raw user input here.
	 */
	footer?: string | null;
}

/**
 * Assemble a consistent rich notification: an emoji + bold title, a blank
 * line, one line per field, then an optional footer. Returns an HTML string
 * to send with `parse_mode: "HTML"`.
 */
export function tgMessage(input: TgMessageInput): string {
	const header = `${input.icon ? `${input.icon} ` : ""}${tgBold(input.title)}`;

	const lines = (input.fields ?? [])
		.filter((field): field is TgField => Boolean(field))
		.map((field) => {
			const icon = field.icon ? `${field.icon} ` : "";
			const label = field.label ? `${tgBold(`${field.label}:`)} ` : "";
			const value = field.copyable
				? tgCopyable(field.value)
				: tgEscape(field.value);
			return `${icon}${label}${value}`;
		});

	const parts = [header];
	if (lines.length > 0) {
		parts.push("", ...lines);
	}
	if (input.footer) {
		parts.push("", input.footer);
	}
	return parts.join("\n");
}
