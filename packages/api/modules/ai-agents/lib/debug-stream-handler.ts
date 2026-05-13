import {
	buildAgentMessages,
	buildAgentTelemetry,
	createAgentStream,
	type DbMessageRow,
	extractToolPromptOverrides,
	type PromptSection,
	resolveAgentTools,
	type UIMessage,
} from "@repo/ai";
import { requirePermission } from "@repo/api/lib/permission";
import { auth } from "@repo/auth";
import { config } from "@repo/config";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { fetchServicePlansSection } from "./service-plans-context";

const FALLBACK_MESSAGE =
	"I'm having trouble right now. Please try again shortly.";

interface DebugStreamBody {
	agentId?: unknown;
	contactPhone?: unknown;
	contactName?: unknown;
	messages?: unknown;
}

/**
 * Ephemeral chat endpoint used by the agent Debug page. Authenticated via the
 * admin's session — runs the full agent pipeline with an injected
 * `contactPhone` / `contactName` so ISP tools see the impersonated identity.
 *
 * No DB persistence: the conversation lives only in the request — `messages`
 * is the full transcript posted from the client. The escalation safety-net
 * guard is intentionally skipped so testing doesn't page real humans.
 */
export async function handleDebugChatStream(
	request: Request,
): Promise<Response> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	let body: DebugStreamBody;
	try {
		body = (await request.json()) as DebugStreamBody;
	} catch {
		return new Response("Invalid request body", { status: 400 });
	}

	const agentId = typeof body.agentId === "string" ? body.agentId : null;
	if (!agentId) {
		return new Response("Missing agentId", { status: 400 });
	}

	const rawMessages = body.messages;
	if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
		return new Response("No messages provided", { status: 400 });
	}

	const contactPhone =
		typeof body.contactPhone === "string" && body.contactPhone.trim()
			? body.contactPhone.trim()
			: undefined;
	const contactName =
		typeof body.contactName === "string" && body.contactName.trim()
			? body.contactName.trim()
			: undefined;

	const agent = await db.aiAgent.findFirst({
		where: { id: agentId },
	});

	if (!agent) {
		return new Response("Agent not found", { status: 404 });
	}

	try {
		await requirePermission(
			agent.organizationId,
			session.user.id,
			"aiAgents",
			"read",
		);
	} catch {
		return new Response("Forbidden", { status: 403 });
	}

	const uiMessages = rawMessages as UIMessage[];
	const historyRows: DbMessageRow[] = uiMessages.map((m) => ({
		role: m.role,
		content: extractTextFromParts(m.parts),
		parts: m.parts,
	}));

	const { tools, agentToolConfigs } = await resolveAgentTools({
		agent,
		conversationId: `debug-${agent.id}-${session.user.id}`,
		externalChatId: `debug-${session.user.id}`,
		contactName,
		contactPhone,
	});

	const servicePlans = await fetchServicePlansSection(
		agent.organizationId,
		agent.servicePlansEnabled,
		agent.servicePlanIds,
	);

	// Mock the WhatsApp channel: pass contact info into the system prompt so
	// the agent knows it has a verified phone (and skips the "ask for phone"
	// step), and turn off `isWebChat` so the agent runs the same prompt
	// sections it would for a real messaging-channel customer.
	const messages = buildAgentMessages({
		systemOptions: {
			basePrompt: agent.systemPrompt,
			enabledTools: agent.enabledTools,
			maintenanceMode: agent.maintenanceMode,
			maintenanceMessage: agent.maintenanceMessage ?? undefined,
			isWebChat: false,
			provider: "whatsapp",
			contactName,
			contactPhone,
			servicePlans,
			promptSections: agent.promptSections as unknown as PromptSection[],
			toolPromptOverrides: extractToolPromptOverrides(agentToolConfigs),
		},
		history: historyRows,
		lastMessageAt: null,
		contextGapThresholdMinutes: agent.contextGapThresholdMinutes,
	});

	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort(),
		config.ai.responseTimeoutMs,
	);

	const streamResult = createAgentStream({
		model: agent.model,
		messages,
		temperature: agent.temperature,
		abortSignal: abortController.signal,
		tools,
		telemetry: buildAgentTelemetry({
			conversationId: `debug-${agent.id}`,
			agentId: agent.id,
			organizationId: agent.organizationId,
		}),
	});

	streamResult.consumeStream();

	return streamResult.toUIMessageStreamResponse({
		onFinish: () => {
			clearTimeout(timeout);
		},
		onError: (error) => {
			clearTimeout(timeout);
			logger.error("Debug chat stream errored", { error, agentId });
			return FALLBACK_MESSAGE;
		},
	});
}

function extractTextFromParts(parts: UIMessage["parts"] | undefined): string {
	if (!parts) {
		return "";
	}
	const chunks: string[] = [];
	for (const part of parts) {
		if (part.type === "text" && typeof part.text === "string") {
			chunks.push(part.text);
		}
	}
	return chunks.join("");
}
