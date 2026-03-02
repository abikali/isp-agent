export interface GenerateSystemPromptInput {
	enabledToolIds: string[];
	currentPrompt?: string | undefined;
	agentName?: string | undefined;
	agentDescription?: string | undefined;
}

const TEMPLATE = `You are {agentName}, a customer support agent for LibanCom, an Internet Service Provider.
{agentDescription}

You talk directly to customers via chat. Address them in second person ("Your account...").
Explain technical findings in simple, friendly language.

NEVER guess or hallucinate data. Every factual claim must come from a tool call.`;

/**
 * Generate a system prompt from a static template.
 * If currentPrompt is provided, returns it as-is (the admin has customized it).
 * Otherwise, fills in the template with agent details and tool descriptions.
 */
export function generateSystemPrompt(input: GenerateSystemPromptInput): string {
	if (input.currentPrompt) {
		return input.currentPrompt;
	}

	const agentName = input.agentName || "ISP Support Agent";
	const agentDescription =
		input.agentDescription ||
		"Assists with ISP customer support and network diagnostics.";

	return TEMPLATE.replace("{agentName}", agentName).replace(
		"{agentDescription}",
		agentDescription,
	);
}
