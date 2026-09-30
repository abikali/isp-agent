/**
 * One-off backfill for conversation summaries (#17): summarise the last
 * 7 days of bot conversations so the customer Bot tab is not empty on day 1.
 * Never sends Telegram.
 *
 * Each conversation's messages are split into episodes at pauses of the
 * agent's `contextGapThresholdMinutes`; every substantive episode without a
 * summary (same conversationId + toAt) gets one, using the agent's own key.
 * The sweep watermark (`summarized_through_at`) is then set to the last
 * message so the live sweep does not summarise the same messages again.
 * Idempotent: re-running skips episodes that already have a summary.
 *
 * Dry run by default (counts the episodes, calls no model); --apply writes.
 *
 *   pnpm --filter @repo/jobs exec tsx scripts/jhonny26-backfill-conversation-summaries.ts [--apply] [--org <organizationId>]
 *
 * Needs DATABASE_URL and AI_CHANNEL_ENCRYPTION_KEY (to decrypt agent keys).
 * About one mini-model call per episode (~5/day for LibanCom → ~35 calls).
 */

import {
	type EpisodeRow,
	isSubstantiveEpisode,
	resolveAgentCredentials,
	summarizeConversationEpisode,
} from "@repo/ai";
import { db } from "@repo/database";

// biome-ignore lint/suspicious/noConsole: one-off CLI script, console is the UX
const log = console.log.bind(console);

const DAY_MS = 24 * 60 * 60 * 1000;

interface Row extends EpisodeRow {
	createdAt: Date;
}

function splitEpisodes(rows: Row[], gapMinutes: number): Row[][] {
	const episodes: Row[][] = [];
	let current: Row[] = [];
	for (const row of rows) {
		const prev = current[current.length - 1];
		if (
			prev &&
			row.createdAt.getTime() - prev.createdAt.getTime() >=
				gapMinutes * 60_000
		) {
			episodes.push(current);
			current = [];
		}
		current.push(row);
	}
	if (current.length > 0) {
		episodes.push(current);
	}
	return episodes;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const orgIndex = process.argv.indexOf("--org");
	const organizationId =
		orgIndex > 0 ? (process.argv[orgIndex + 1] ?? null) : null;
	const since = new Date(Date.now() - 7 * DAY_MS);

	const conversations = await db.aiConversation.findMany({
		where: {
			lastMessageAt: { gte: since },
			...(organizationId ? { agent: { organizationId } } : {}),
		},
		select: {
			id: true,
			lastMessageAt: true,
			contactName: true,
			verifiedCustomerId: true,
			verifiedCustomer: {
				select: { firstName: true, lastName: true, username: true },
			},
			agent: {
				select: {
					id: true,
					organizationId: true,
					provider: true,
					encryptedApiKey: true,
					contextGapThresholdMinutes: true,
				},
			},
		},
	});
	log(
		`${conversations.length} conversations active since ${since.toISOString()} (${apply ? "APPLY" : "dry run"})`,
	);

	let stored = 0;
	let candidates = 0;
	for (const conversation of conversations) {
		const messages = await db.aiMessage.findMany({
			where: {
				conversationId: conversation.id,
				deletedAt: null,
				createdAt: { gte: since },
			},
			orderBy: { createdAt: "asc" },
			select: {
				role: true,
				content: true,
				parts: true,
				isFollowUp: true,
				createdAt: true,
			},
		});
		const tasks = await db.task.findMany({
			where: {
				conversationId: conversation.id,
				source: "AI_ESCALATION",
				createdAt: { gte: since },
			},
			select: { id: true, createdAt: true },
		});
		const agent = conversation.agent;
		for (const rows of splitEpisodes(
			messages,
			agent.contextGapThresholdMinutes,
		)) {
			const first = rows[0];
			const last = rows[rows.length - 1];
			if (!first || !last) {
				continue;
			}
			const task = tasks.find(
				(t) =>
					t.createdAt >= first.createdAt &&
					t.createdAt.getTime() <=
						last.createdAt.getTime() + 5 * 60_000,
			);
			if (!isSubstantiveEpisode(rows, Boolean(task))) {
				continue;
			}
			const exists = await db.aiConversationSummary.findFirst({
				where: {
					conversationId: conversation.id,
					toAt: last.createdAt,
				},
				select: { id: true },
			});
			if (exists) {
				continue;
			}
			candidates++;
			if (!apply) {
				continue;
			}
			let credentials: ReturnType<typeof resolveAgentCredentials>;
			try {
				credentials = resolveAgentCredentials(agent);
			} catch {
				log(`  skip ${conversation.id}: agent ${agent.id} has no key`);
				break;
			}
			const customer = conversation.verifiedCustomer;
			const customerName =
				[customer?.firstName, customer?.lastName]
					.filter(Boolean)
					.join(" ") || conversation.contactName;
			const result = await summarizeConversationEpisode({
				credentials,
				rows,
				customerName,
				customerUsername: customer?.username ?? null,
				escalated: Boolean(task),
			});
			if (!result) {
				log(
					`  summary failed for ${conversation.id} @ ${last.createdAt.toISOString()}`,
				);
				continue;
			}
			await db.aiConversationSummary.create({
				data: {
					organizationId: agent.organizationId,
					agentId: agent.id,
					conversationId: conversation.id,
					customerId: conversation.verifiedCustomerId,
					fromAt: first.createdAt,
					toAt: last.createdAt,
					userMessages: rows.filter((r) => r.role === "user").length,
					botMessages: rows.filter((r) => r.role === "assistant")
						.length,
					adminMessages: rows.filter((r) => r.role === "admin")
						.length,
					outcome: result.summary.outcome,
					customerMood: result.summary.customerMood,
					summary: result.summary.summary,
					botActions: result.summary.botActions,
					openItems: result.summary.openItems,
					taskId: task?.id ?? null,
					model: result.model,
				},
			});
			stored++;
		}
		if (apply && conversation.lastMessageAt) {
			await db.aiConversation.update({
				where: { id: conversation.id },
				data: { summarizedThroughAt: conversation.lastMessageAt },
			});
		}
	}
	log(
		apply
			? `Stored ${stored} of ${candidates} episode summaries.`
			: `${candidates} episodes would be summarised. Re-run with --apply.`,
	);
	await db.$disconnect();
}

main().catch((error) => {
	// biome-ignore lint/suspicious/noConsole: one-off CLI script, console is the UX
	console.error(error);
	process.exit(1);
});
