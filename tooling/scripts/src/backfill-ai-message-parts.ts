/**
 * One-off backfill: populate `ai_message.parts` for assistant rows that still
 * only have legacy `toolCalls + content`. Idempotent — re-running is a no-op.
 *
 * Run interactively against the target database:
 *   dotenv -c -e ../../.env -- tsx tooling/scripts/src/backfill-ai-message-parts.ts
 * or via the package script:
 *   pnpm --filter @repo/scripts backfill:ai-parts
 *
 * Safe to interrupt: the cursor advances by id; the next run picks up where
 * the previous one stopped. Reads `toolCalls` and `content`, writes `parts` —
 * never mutates the source columns, so the column drop migration that follows
 * cannot lose data.
 */
import { assistantMessageToParts, legacyRowToParts } from "@repo/ai";
import { db, Prisma } from "@repo/database";
import { logger } from "@repo/logs";

const BATCH = 500;

async function main() {
	logger.info("Backfilling ai_message.parts for assistant rows...");
	let lastId: string | null = null;
	let touched = 0;
	let scanned = 0;

	for (;;) {
		const rows: Array<{
			id: string;
			content: string;
			toolCalls: unknown;
		}> = await db.aiMessage.findMany({
			where: {
				role: "assistant",
				parts: { equals: Prisma.DbNull },
				...(lastId ? { id: { gt: lastId } } : {}),
			},
			take: BATCH,
			orderBy: { id: "asc" },
			select: { id: true, content: true, toolCalls: true },
		});

		if (rows.length === 0) {
			break;
		}

		scanned += rows.length;

		for (const row of rows) {
			const parts = Array.isArray(row.toolCalls)
				? legacyRowToParts(row.content, row.toolCalls)
				: assistantMessageToParts(row.content, undefined);

			if (parts.length === 0) {
				continue;
			}

			await db.aiMessage.update({
				where: { id: row.id },
				data: { parts: parts as Prisma.InputJsonValue },
			});
			touched++;
		}

		lastId = rows[rows.length - 1]?.id ?? null;
		logger.info(
			`Scanned ${scanned}, wrote ${touched} so far (cursor=${lastId})`,
		);
	}

	logger.info(`Done. Total assistant rows updated: ${touched}`);
}

main()
	.catch((err) => {
		logger.error("Backfill failed", err);
		process.exit(1);
	})
	.finally(async () => {
		await db.$disconnect();
	});
