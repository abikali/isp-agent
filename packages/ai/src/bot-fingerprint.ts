import { createHash } from "node:crypto";
import { toChatFormatting } from "./chat-formatting";

/**
 * Compute a content fingerprint for a bot-sent message.
 * Uses SHA-256 of the first 200 chars of text, truncated to 16 hex chars.
 *
 * IMPORTANT: No chatId in the fingerprint — JID format mismatch between
 * bot sends (@lid) and webhook echoes (@s.whatsapp.net) would break matching.
 *
 * Text is normalized through `toChatFormatting` first: senders convert
 * markdown to chat formatting on the wire, so the webhook echo carries the
 * converted text while track-time callers pass the raw LLM output. The
 * conversion is idempotent, so hashing the normalized form makes both sides
 * agree.
 */
export function computeBotFingerprint(text: string): string {
	return createHash("sha256")
		.update(toChatFormatting(text).slice(0, 200))
		.digest("hex")
		.slice(0, 16);
}

/**
 * Check if human takeover is currently active for a conversation.
 * Returns true if takeover is set and hasn't expired.
 */
export function isHumanTakeoverActive(
	humanTakeoverAt: Date | null,
	humanTakeoverHours: number | null,
): boolean {
	if (!humanTakeoverAt || !humanTakeoverHours) {
		return false;
	}
	const expiresAt = new Date(
		humanTakeoverAt.getTime() + humanTakeoverHours * 60 * 60 * 1000,
	);
	return new Date() < expiresAt;
}
