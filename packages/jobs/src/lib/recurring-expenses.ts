import { db } from "@repo/database";
import { logger } from "@repo/logs";

/** "YYYY-MM" in UTC — the unit the generator is idempotent on. */
export function monthKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface RecurringLine {
	id: string;
	organizationId: string;
	amount: number;
	description: string;
	financeCategoryId: string | null;
	dayOfMonth: number;
	createdById: string | null;
}

/**
 * Turn one recurring line into this month's approved expense, exactly once.
 * The `updateMany` guarded on `lastGeneratedMonth` is the lock: two workers
 * racing on the same line see one row updated and one row untouched, and only
 * the winner inserts.
 */
export async function generateRecurringExpenseFor(
	line: RecurringLine,
	now = new Date(),
): Promise<boolean> {
	const key = monthKey(now);
	const claimed = await db.recurringExpense.updateMany({
		where: {
			id: line.id,
			OR: [
				{ lastGeneratedMonth: null },
				{ lastGeneratedMonth: { not: key } },
			],
		},
		data: { lastGeneratedMonth: key },
	});
	if (claimed.count === 0) {
		return false;
	}
	// Dated on the day the cost falls due (09:00 UTC keeps it inside the same
	// calendar day in Lebanon), so month filters and the P&L file it right.
	const day = Math.min(
		line.dayOfMonth,
		new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
		).getUTCDate(),
	);
	const createdAt = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 9),
	);
	await db.expense.create({
		data: {
			organizationId: line.organizationId,
			submittedById: null,
			createdById: line.createdById,
			recurringExpenseId: line.id,
			amount: line.amount,
			description: line.description,
			financeCategoryId: line.financeCategoryId,
			status: "APPROVED",
			approvedById: line.createdById,
			approvedAt: now,
			createdAt,
		},
	});
	return true;
}

/**
 * Daily pass: every active line whose day has arrived and that has not been
 * generated for this month yet. Safe to run any number of times a day.
 */
export async function generateDueRecurringExpenses(
	now = new Date(),
): Promise<number> {
	const key = monthKey(now);
	const due = await db.recurringExpense.findMany({
		where: {
			active: true,
			dayOfMonth: { lte: now.getUTCDate() },
			OR: [
				{ lastGeneratedMonth: null },
				{ lastGeneratedMonth: { not: key } },
			],
		},
		select: {
			id: true,
			organizationId: true,
			amount: true,
			description: true,
			financeCategoryId: true,
			dayOfMonth: true,
			createdById: true,
		},
	});
	let generated = 0;
	for (const line of due) {
		try {
			if (await generateRecurringExpenseFor(line, now)) {
				generated++;
			}
		} catch (error) {
			logger.error("Recurring expense generation failed", {
				lineId: line.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
	if (generated > 0) {
		logger.info("Recurring expenses generated", { generated, month: key });
	}
	return generated;
}
