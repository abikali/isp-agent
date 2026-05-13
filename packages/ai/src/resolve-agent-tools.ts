import { db } from "@repo/database";
import { resolveTools } from "./tools";
import type { ToolContext } from "./tools/types";
import type { ToolRecord } from "./types";

export interface ResolveAgentToolsInput {
	agent: { id: string; organizationId: string; enabledTools: string[] };
	conversationId: string;
	externalChatId: string;
	contactName?: string | undefined;
	contactPhone?: string | undefined;
}

export type AgentToolConfigRow = Awaited<
	ReturnType<typeof db.aiAgentToolConfig.findMany>
>[number];

export interface ResolveAgentToolsResult {
	tools: ToolRecord | undefined;
	agentToolConfigs: AgentToolConfigRow[];
}

/**
 * Unified tool resolution for agent turns. Loads per-tool configs, builds the
 * ToolContext, and returns the AI SDK tool record. All callers (web-chat,
 * web-chat-stream, webhook, ai-chat retry worker, debug stream) must go
 * through here so `contactPhone` is set consistently — the retry worker used
 * to silently drop it, breaking phone-first ISP customer identification.
 */
export async function resolveAgentTools(
	input: ResolveAgentToolsInput,
): Promise<ResolveAgentToolsResult> {
	if (input.agent.enabledTools.length === 0) {
		return { tools: undefined, agentToolConfigs: [] };
	}

	const agentToolConfigs = await db.aiAgentToolConfig.findMany({
		where: { agentId: input.agent.id },
	});

	const perToolConfigs: Record<string, Record<string, unknown>> = {};
	for (const tc of agentToolConfigs) {
		perToolConfigs[tc.toolId] = tc.config as Record<string, unknown>;
	}

	const toolContext: ToolContext = {
		organizationId: input.agent.organizationId,
		agentId: input.agent.id,
		conversationId: input.conversationId,
		externalChatId: input.externalChatId,
		contactName: input.contactName,
		contactPhone: input.contactPhone,
	};

	const tools = resolveTools(
		input.agent.enabledTools,
		toolContext,
		perToolConfigs,
	);

	return { tools, agentToolConfigs };
}
