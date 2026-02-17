import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getAvailableTools } from "./tools";

export interface GenerateSystemPromptInput {
	enabledToolIds: string[];
	currentPrompt?: string | undefined;
	agentName?: string | undefined;
	agentDescription?: string | undefined;
}

function buildToolDescriptions(enabledToolIds: string[]): string {
	const allTools = getAvailableTools();
	const enabledTools = allTools.filter((t) => enabledToolIds.includes(t.id));

	if (enabledTools.length === 0) {
		return "No tools are enabled for this agent.";
	}

	return enabledTools
		.map(
			(tool) =>
				`- ${tool.name} (${tool.id}): ${tool.description} [category: ${tool.category}]`,
		)
		.join("\n");
}

const META_SYSTEM_PROMPT = `You are an expert AI prompt engineer. Write a production-quality system prompt for an AI agent on an ISP (Internet Service Provider) management platform called LibanCom.

The prompt you write MUST follow these proven patterns (from OpenAI's GPT-4.1 prompting guide) that improve agentic tool-calling by ~20%:

1. PERSISTENCE: Tell the agent to keep investigating until the issue is fully diagnosed. Never stop after one tool call. If initial results are inconclusive, try alternative approaches or additional tools.

2. TOOL USAGE: Tell the agent to always use tools for real data. Never guess or hallucinate customer info, network status, or ping results. Every factual claim must be backed by a tool call.

3. PLANNING: Before each tool call, briefly explain what will be checked and why. After receiving results, analyze them before deciding the next step.

4. MULTI-STEP DIAGNOSTIC CHAINS: Teach specific troubleshooting workflows:
   - Slow internet: search customer -> check online status -> get bandwidth stats -> ping customer -> check AP load if needed
   - Can't connect: search customer -> check account (blocked/expired/inactive?) -> ping customer -> ping station -> check interface stats
   - General inquiry: search customer -> present filtered account overview
   - Network-wide issue: check AP users -> identify patterns -> ping affected infrastructure

5. STRUCTURED RESPONSES: Present findings clearly with status summaries. Use clear formatting with sections for diagnosis, findings, and next steps.

6. BOUNDARIES: The agent should stay within its tools. If it cannot resolve an issue, summarize all findings and recommend escalation with specific details for the support team.

The prompt MUST be written in the second person ("You are...").
The prompt should be concise but thorough — aim for 300-600 words.
Do NOT include markdown formatting like headers or bold — write it as plain instructional text.
Do NOT wrap the output in quotes or code blocks — just output the raw prompt text.`;

export async function generateSystemPrompt(
	input: GenerateSystemPromptInput,
): Promise<string> {
	const toolDescriptions = buildToolDescriptions(input.enabledToolIds);
	const agentName = input.agentName || "ISP Support Agent";
	const agentDescription =
		input.agentDescription ||
		"Assists with ISP customer support and network diagnostics";

	const userMessage = input.currentPrompt
		? `Enhance and improve this existing system prompt. Preserve its core intent but apply the best practices described above:\n\n${input.currentPrompt}`
		: "Generate a complete system prompt from scratch.";

	const contextBlock = `Available tools:\n${toolDescriptions}\n\nAgent name: ${agentName}\nAgent description: ${agentDescription}`;

	const { text } = await generateText({
		model: openai("gpt-4.1"),
		system: META_SYSTEM_PROMPT,
		prompt: `${contextBlock}\n\n${userMessage}`,
	});

	return text;
}
