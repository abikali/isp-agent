import { computeBotFingerprint, isHumanTakeoverActive } from "@repo/ai";
import type { getRedisConnection } from "@repo/jobs";

export { computeBotFingerprint, isHumanTakeoverActive };

/**
 * Track a bot-sent message by content fingerprint so we can distinguish
 * its webhook echo from a human-sent phone message.
 * Stored in Redis with 600s TTL (10 minutes) — enough for slow AI generations with tool chains.
 */
export function trackBotMessage(
	redis: ReturnType<typeof getRedisConnection>,
	text: string,
): void {
	if (!text) {
		return;
	}
	const fp = computeBotFingerprint(text);
	redis.set(`ai:bot-fp:${fp}`, "1", "EX", 600).catch(() => {});
}

/**
 * Keys identifying a contact card or location pin, for matching a dashboard
 * send against its webhook echo. Text fingerprints don't work here: the echo
 * text is rebuilt from the vCard WaSender generates (number formatting may
 * differ), so contacts match on the last 8 digits of each number and pins on
 * rounded coordinates. No chatId, for the same @lid vs @s.whatsapp.net reason
 * as `computeBotFingerprint`.
 */
export function sentCardKeys(card: {
	numbers?: string[] | undefined;
	latitude?: number | undefined;
	longitude?: number | undefined;
}): string[] {
	const keys: string[] = [];
	for (const number of card.numbers ?? []) {
		const digits = number.replace(/\D/g, "");
		if (digits.length >= 6) {
			keys.push(`ai:bot-card:contact:${digits.slice(-8)}`);
		}
	}
	if (card.latitude != null && card.longitude != null) {
		keys.push(
			`ai:bot-card:location:${card.latitude.toFixed(4)},${card.longitude.toFixed(4)}`,
		);
	}
	return keys;
}

/** Remember a card the dashboard just sent, for 2 minutes. */
export function trackSentCard(
	redis: ReturnType<typeof getRedisConnection>,
	keys: string[],
): void {
	for (const key of keys) {
		redis.set(key, "1", "EX", 120).catch(() => {});
	}
}

/** True when a fromMe card matches one the dashboard sent in the last 2 minutes. */
export async function isSentCardEcho(
	redis: ReturnType<typeof getRedisConnection>,
	keys: string[],
): Promise<boolean> {
	if (keys.length === 0) {
		return false;
	}
	const hits = await redis.mget(...keys);
	return hits.some(Boolean);
}
