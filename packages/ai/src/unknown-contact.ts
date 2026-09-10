import { db } from "@repo/database";
import { logger } from "@repo/logs";
import type { ModelMessage } from "ai";
import type { ToolRecord } from "./types";

/**
 * When the bot still cannot tell who it is talking to after a couple of
 * turns, tell a human. This used to live only in the retry worker, so it
 * fired only for conversations that had hit a generation error — normal
 * traffic never reached it. Both reply paths call it now.
 *
 * Returns the sentence to append to the reply, or null when nothing was
 * done. Stamps `unknownEscalatedAt` so it fires once per conversation.
 */
export async function maybeEscalateUnknownContact(input: {
	conversation: {
		id: string;
		contactName: string | null;
		contactId: string | null;
		verifiedCustomerId: string | null;
		unknownEscalatedAt: Date | null;
	};
	enabledTools: string[];
	tools: ToolRecord | undefined;
	messages: ModelMessage[];
	minUserMessages?: number;
}): Promise<string | null> {
	const { conversation, tools } = input;
	if (
		!tools ||
		!input.enabledTools.includes("escalate-telegram") ||
		conversation.verifiedCustomerId ||
		conversation.unknownEscalatedAt
	) {
		return null;
	}
	const userMessages = input.messages.filter((m) => m.role === "user");
	if (userMessages.length < (input.minUserMessages ?? 2)) {
		return null;
	}
	const escalateTool = tools["escalate-telegram"];
	if (!escalateTool?.execute) {
		return null;
	}
	try {
		const recent = userMessages
			.slice(-3)
			.map((m) =>
				typeof m.content === "string" ? m.content.slice(0, 200) : "",
			)
			.filter(Boolean)
			.join("\n");
		await escalateTool.execute(
			{
				reason: "Unknown contact — could not be identified after multiple turns",
				priority: "medium" as const,
				category: "general" as const,
				summary: `Unknown contact (${conversation.contactName ?? conversation.contactId ?? "no name"}) has sent ${userMessages.length} messages but the bot could not link them to a customer (phone not on any active account, or the customer does not know their username). Recent messages:\n${recent}`,
				customerName: conversation.contactName ?? undefined,
				actionRequired:
					"Reach out to the contact, confirm who they are and which account is theirs.",
			},
			{
				toolCallId: `unknown-${conversation.id}`,
				messages: [],
				abortSignal: AbortSignal.timeout(30000),
			},
		);
		await db.aiConversation.update({
			where: { id: conversation.id },
			data: { unknownEscalatedAt: new Date() },
		});
		return "I've notified a team member who will join you shortly.";
	} catch (error) {
		logger.error("Unknown contact auto-escalation failed", {
			conversationId: conversation.id,
			error,
		});
		return null;
	}
}
