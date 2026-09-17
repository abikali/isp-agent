import { db } from "@repo/database";
import type { DbMessageRow } from "./history";

/**
 * The newest `take` rows of a conversation, chronological, with the
 * `createdAt` that `buildAgentMessages` needs to split and cut the history.
 * Every path that replays a conversation to a model loads it through here so
 * the reply, the retry, the follow-up and the debug replay all see the same
 * rows.
 */
export async function loadHistoryRows(
	conversationId: string,
	take: number,
): Promise<DbMessageRow[]> {
	const rows = await db.aiMessage.findMany({
		where: { conversationId },
		orderBy: { createdAt: "desc" },
		take,
		select: {
			role: true,
			content: true,
			toolCalls: true,
			parts: true,
			attachmentType: true,
			createdAt: true,
		},
	});
	return rows.reverse();
}
