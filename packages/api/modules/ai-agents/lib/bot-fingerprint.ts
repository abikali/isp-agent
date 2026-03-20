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
