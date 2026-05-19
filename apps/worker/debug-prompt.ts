/**
 * Debug script: reproduces the exact prompt assembly + model call for a given
 * conversation, prints the full messages array sent to the LLM, and (optionally)
 * re-runs the call and prints the response + provider metadata.
 *
 * Run:  node --import tsx apps/worker/debug-prompt.ts <conversationId> [--call]
 */

// biome-ignore-all lint/suspicious/noConsole: debug script prints to stdout
// biome-ignore-all lint/style/noNonNullAssertion: bounded loop indexing
// biome-ignore-all lint/style/useBlockStatements: terse sample-counter

import {
	buildAgentMessages,
	type DbMessageRow,
	extractToolPromptOverrides,
	generateAgentResponse,
	type PromptSection,
} from "@repo/ai";
import { db } from "@repo/database";

const [, , conversationId, ...flags] = process.argv;
const shouldCall = flags.includes("--call");

if (!conversationId) {
	console.error("usage: debug-prompt.ts <conversationId> [--call]");
	process.exit(1);
}

async function main() {
	const conversation = await db.aiConversation.findUnique({
		where: { id: conversationId },
		include: {
			agent: { include: { toolConfigs: true } },
			channel: true,
			verifiedCustomer: { include: { plan: true } },
		},
	});

	if (!conversation) {
		throw new Error(`conversation ${conversationId} not found`);
	}

	const history = await db.aiMessage.findMany({
		where: { conversationId, deletedAt: null },
		orderBy: { createdAt: "asc" },
		take: conversation.agent.maxHistoryLength,
	});

	console.log("=".repeat(80));
	console.log("AGENT");
	console.log("=".repeat(80));
	console.log("  id            :", conversation.agent.id);
	console.log("  name          :", conversation.agent.name);
	console.log("  model (in DB) :", conversation.agent.model);
	console.log("  temperature   :", conversation.agent.temperature);
	console.log("  maxHistory    :", conversation.agent.maxHistoryLength);
	console.log(
		"  enabledTools  :",
		conversation.agent.enabledTools.length,
		"tools",
	);
	console.log(
		"  promptSections:",
		Array.isArray(conversation.agent.promptSections)
			? `${conversation.agent.promptSections.length} sections`
			: "null/empty (will fall back to DEFAULT_PROMPT_SECTIONS)",
	);

	console.log("\n", "=".repeat(80));
	console.log("CONVERSATION");
	console.log("=".repeat(80));
	console.log("  externalChatId  :", conversation.externalChatId);
	console.log("  contactName     :", conversation.contactName);
	console.log(
		"  provider        :",
		conversation.channel?.provider ?? "(web)",
	);
	console.log(
		"  verifiedCustomer:",
		conversation.verifiedCustomerId ?? "(none)",
	);
	console.log("  history rows    :", history.length);

	const verifiedCustomer = conversation.verifiedCustomer
		? {
				fullName:
					[
						conversation.verifiedCustomer.firstName,
						conversation.verifiedCustomer.lastName,
					]
						.filter(Boolean)
						.join(" ") || undefined,
				username: conversation.verifiedCustomer.username ?? undefined,
				accountNumber:
					conversation.verifiedCustomer.accountNumber ?? undefined,
				status: conversation.verifiedCustomer.status,
				planName: conversation.verifiedCustomer.plan?.name ?? undefined,
			}
		: undefined;

	const historyRows: DbMessageRow[] = history.map((h) => ({
		role: h.role,
		content: h.content,
		parts: h.parts as DbMessageRow["parts"],
		toolCalls: h.toolCalls as DbMessageRow["toolCalls"],
		createdAt: h.createdAt,
		deliveryStatus: h.deliveryStatus,
		attachmentType: h.attachmentType,
		attachmentUrl: h.attachmentUrl,
		attachmentMimeType: h.attachmentMimeType,
	}));

	const messages = buildAgentMessages({
		systemOptions: {
			basePrompt: conversation.agent.systemPrompt,
			enabledTools: conversation.agent.enabledTools,
			contactName: conversation.contactName ?? undefined,
			contactPhone: conversation.contactId ?? undefined,
			verifiedCustomer,
			maintenanceMode: conversation.agent.maintenanceMode,
			maintenanceMessage:
				conversation.agent.maintenanceMessage ?? undefined,
			provider: conversation.channel?.provider ?? "messaging",
			promptSections: conversation.agent
				.promptSections as unknown as PromptSection[],
			toolPromptOverrides: extractToolPromptOverrides(
				conversation.agent.toolConfigs,
			),
		},
		history: historyRows,
		lastMessageAt: conversation.lastMessageAt,
		contextGapThresholdMinutes:
			conversation.agent.contextGapThresholdMinutes,
	});

	console.log("\n", "=".repeat(80));
	console.log(`MESSAGES SENT TO LLM (${messages.length} total)`);
	console.log("=".repeat(80));

	for (let i = 0; i < messages.length; i++) {
		const m = messages[i]!;
		const contentStr =
			typeof m.content === "string"
				? m.content
				: JSON.stringify(m.content, null, 2);
		const hasCache = m.providerOptions ? " [CACHE_BREAKPOINT]" : "";
		console.log(
			`\n--- [${i}] role=${m.role}${hasCache} (chars=${contentStr.length}) ---`,
		);
		console.log(contentStr);
	}

	console.log("\n", "=".repeat(80));
	console.log("PROMPT STATS");
	console.log("=".repeat(80));
	const totalChars = messages.reduce((sum, m) => {
		const s =
			typeof m.content === "string"
				? m.content
				: JSON.stringify(m.content);
		return sum + s.length;
	}, 0);
	console.log("  total characters:", totalChars);
	console.log("  rough tokens    :", Math.round(totalChars / 4));

	if (!shouldCall) {
		console.log("\n(pass --call to actually invoke the model)");
		await db.$disconnect();
		return;
	}

	console.log("\n", "=".repeat(80));
	console.log("INVOKING MODEL — full history as is (3 samples)");
	console.log("=".repeat(80));

	for (let i = 1; i <= 3; i++) {
		const start = Date.now();
		const result = await generateAgentResponse({
			model: conversation.agent.model,
			messages,
			temperature: conversation.agent.temperature,
		});
		const elapsed = Date.now() - start;

		console.log(`\n--- sample ${i} (full history) ---`);
		console.log(
			`latency: ${elapsed}ms tokens: in=${result.inputTokens} out=${result.outputTokens}`,
		);
		console.log("response:", result.text);
	}

	// Reproduce the FIRST-TURN scenario at temperature=0.2 (agent setting), 10 samples,
	// and at temperature=0 (greedy) for comparison. Watch for ساعدتك vs نساعدك vs ساعدك.
	console.log("\n", "=".repeat(80));
	console.log("INVOKING MODEL — first-turn 'Hello' @ temp 0.2 (10 samples)");
	console.log("=".repeat(80));
	const firstTurnMessages = messages
		.filter((m) => m.role === "system")
		.concat([{ role: "user", content: "Hello" }]);

	let brokenCount = 0;
	for (let i = 1; i <= 10; i++) {
		const result = await generateAgentResponse({
			model: conversation.agent.model,
			messages: firstTurnMessages,
			temperature: 0.2,
		});
		const broken = result.text.includes("ساعدتك");
		if (broken) brokenCount++;
		console.log(
			`s${i} ${broken ? "❌ BROKEN(ساعدتك)" : "✓"}: ${result.text.replace(/\n/g, " | ")}`,
		);
	}
	console.log(`\n>> temp 0.2: ${brokenCount}/10 broken`);

	console.log("\n", "=".repeat(80));
	console.log(
		"INVOKING MODEL — first-turn 'Hello' @ temp 0 (greedy, 3 samples)",
	);
	console.log("=".repeat(80));
	for (let i = 1; i <= 3; i++) {
		const result = await generateAgentResponse({
			model: conversation.agent.model,
			messages: firstTurnMessages,
			temperature: 0,
		});
		const broken = result.text.includes("ساعدتك");
		console.log(
			`s${i} ${broken ? "❌ BROKEN(ساعدتك)" : "✓"}: ${result.text.replace(/\n/g, " | ")}`,
		);
	}

	// Sanity: confirm temp 0.2 + claude-sonnet handles it perfectly.
	console.log("\n", "=".repeat(80));
	console.log(
		"INVOKING MODEL — first-turn 'Hello' with claude-sonnet @ temp 0.2 (3 samples)",
	);
	console.log("=".repeat(80));
	for (let i = 1; i <= 3; i++) {
		const result = await generateAgentResponse({
			model: "claude-sonnet",
			messages: firstTurnMessages,
			temperature: 0.2,
		});
		const broken = result.text.includes("ساعدتك");
		console.log(
			`s${i} ${broken ? "❌ BROKEN(ساعدتك)" : "✓"}: ${result.text.replace(/\n/g, " | ")}`,
		);
	}

	// Direct call via OpenRouter to inspect upstream model + raw output.
	console.log("\n", "=".repeat(80));
	console.log("DIRECT OPENROUTER CALL (bypass AI SDK)");
	console.log("=".repeat(80));
	const openRouterId = (
		{
			"claude-haiku": "anthropic/claude-haiku-4.5",
			"claude-sonnet": "anthropic/claude-sonnet-4.5",
		} as const
	)[conversation.agent.model];
	if (openRouterId) {
		const systemContent = messages
			.filter((m) => m.role === "system")
			.map((m) =>
				typeof m.content === "string"
					? m.content
					: JSON.stringify(m.content),
			)
			.join("\n\n");
		const userMessages = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role,
				content:
					typeof m.content === "string"
						? m.content
						: JSON.stringify(m.content),
			}));
		const resp = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: openRouterId,
					temperature: conversation.agent.temperature,
					messages: [
						{ role: "system", content: systemContent },
						...userMessages,
					],
				}),
			},
		);
		const j = await resp.json();
		console.log("upstream model :", j.model);
		console.log("provider       :", j.provider);
		console.log("usage          :", JSON.stringify(j.usage));
		console.log("finish_reason  :", j.choices?.[0]?.finish_reason);
		console.log("response:");
		console.log(j.choices?.[0]?.message?.content);
	}

	await db.$disconnect();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
