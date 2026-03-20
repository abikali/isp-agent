import { createHash } from "node:crypto";

/**
 * Compute a content fingerprint for a bot-sent message.
 * Uses SHA-256 of the first 200 chars of text, truncated to 16 hex chars.
 *
 * IMPORTANT: No chatId in the fingerprint — JID format mismatch between
 * bot sends (@lid) and webhook echoes (@s.whatsapp.net) would break matching.
 */
export function computeBotFingerprint(text: string): string {
	return createHash("sha256")
		.update(text.slice(0, 200))
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
