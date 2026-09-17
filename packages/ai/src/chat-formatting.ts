/**
 * Bracketed stage directions naming a real tool — e.g.
 * `[runs isp-diagnose-customer with "youssef kamal"]`.
 *
 * Some models narrate a tool call as prose instead of emitting it, then stop.
 * Measured on production WhatsApp traffic: 10 occurrences in 45 days, every
 * one of them shipped to the customer, who was told a check was running that
 * never ran. Matching requires an actual registered tool name inside the
 * brackets, so ordinary bracketed asides are left alone.
 */
const TOOL_NARRATION_RE =
	/[[（(]\s*[^\]\n)]*\b(?:isp-[a-z-]+|escalate-telegram|ping-host|port-scan|dns-lookup|speed-test|email-check|traceroute)\b[^\]\n)]*[\])）]/gi;

/** True when the reply narrates a tool call instead of making one. */
export function hasToolNarration(text: string): boolean {
	TOOL_NARRATION_RE.lastIndex = 0;
	return TOOL_NARRATION_RE.test(text);
}

/**
 * Remove tool-call stage directions from a reply. The surrounding sentences
 * are kept — they are usually a normal "let me check that for you", which
 * reads fine on its own.
 */
export function stripToolNarration(text: string): string {
	return text
		.replace(TOOL_NARRATION_RE, "")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * Internal history markers the model is never meant to repeat:
 * `[Human teammate reply …]` (how a teammate's turn is labelled in the
 * context), `[Context Notice: …]` (the time-gap note) and `[Follow-up check: …]`
 * (the silence follow-up instruction). Models copy the
 * last assistant-side turn when the customer only says "ok" — measured on
 * prod: 8 replies since June that were nothing but the teammate marker,
 * every one delivered to the customer verbatim.
 */
const INTERNAL_MARKER_RE =
	/\[(?:Human teammate reply|Context Notice|Follow-up check)[^\]]*\]/g;

/** Remove echoed internal markers; may leave an empty string. */
export function stripInternalMarkers(text: string): string {
	return text
		.replace(INTERNAL_MARKER_RE, "")
		.replace(/[ \t]+$/gm, "")
		.replace(/^\n+/, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

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
	let out = stripToolNarration(stripInternalMarkers(text));
	// **bold** → *bold* (no newlines inside — chat bold doesn't span lines)
	out = out.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
	// __italic__ → _italic_
	out = out.replace(/__([^_\n]+)__/g, "_$1_");
	// ATX headers (# Title) → bold line
	out = out.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
	return out;
}
