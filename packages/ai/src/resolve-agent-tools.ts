import { db } from "@repo/database";
import { resolveTools } from "./tools";
import type { ToolContext } from "./tools/types";
import type { ToolRecord } from "./types";

export interface ResolveAgentToolsInput {
	agent: {
		id: string;
		organizationId: string;
		enabledTools: string[];
		maintenanceMode?: boolean | undefined;
	};
	/**
	 * Effective maintenance state computed by the caller (manual toggle OR an
	 * active scheduled window). When provided it overrides `agent.maintenanceMode`
	 * for the lockdown decision; falls back to the raw flag when omitted.
	 */
	maintenanceActive?: boolean | undefined;
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
	// Maintenance mode = full lockdown. The agent gets NO tools while a known
	// outage is being handled, so it physically cannot run diagnostics, look up
	// accounts, or escalate — instead of merely being *told* not to. The prompt
	// side (buildSystemPromptParts) drops the matching tool instructions. This is
	// enforced in code so even a weak model can't bypass it back into
	// troubleshooting. Bypass the config query entirely — no tools, no configs.
	if (input.maintenanceActive ?? input.agent.maintenanceMode) {
		return { tools: undefined, agentToolConfigs: [] };
	}

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
