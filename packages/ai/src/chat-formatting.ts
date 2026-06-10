/**
 * Normalize LLM markdown to WhatsApp/Telegram chat formatting.
 *
 * Models emit standard markdown (`**bold**`, `### Header`) despite prompt
 * instructions — measured at ~15% of production replies. WhatsApp renders
 * bold with single asterisks and has no headers; Telegram's legacy Markdown
 * parse_mode errors on `**`. Convert deterministically instead of relying
 * on the prompt.
 */
export function toChatFormatting(text: string): string {
	let out = text;
	// **bold** → *bold* (no newlines inside — chat bold doesn't span lines)
	out = out.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
	// __italic__ → _italic_
	out = out.replace(/__([^_\n]+)__/g, "_$1_");
	// ATX headers (# Title) → bold line
	out = out.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
	return out;
}
