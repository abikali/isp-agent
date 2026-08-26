import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import { detectRecurringLines, normaliseDescription } from "../lib/classify";
import { resolvePeriod } from "../lib/period";

/**
 * The money map: the owner's own answer to "what kind of spending is this?".
 *
 * Built as a guided flow rather than a settings screen because the person who
 * knows the answers has never opened a settings screen. It shows him his real
 * recurring lines with real amounts and asks one question per line.
 */

/** Seed the default buckets the first time an org opens the wizard. */
async function ensureCategories(organizationId: string) {
	const existing = await db.financeCategory.count({
		where: { organizationId },
	});
	if (existing > 0) {
		return;
	}
	await db.financeCategory.createMany({
		data: DEFAULT_CATEGORIES.map((c) => ({
			organizationId,
			kind: c.kind,
			label: c.label,
			labelAr: c.labelAr,
			hint: c.hint,
			sortOrder: c.sortOrder,
			isSystem: true,
		})),
		skipDuplicates: true,
	});
}

export const getMoneyMap = protectedProcedure
	.route({
		method: "GET",
		path: "/finance/money-map",
		tags: ["Finance"],
		summary: "Spending lines that still need an owner's classification",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		await ensureCategories(input.organizationId);

		const window = resolvePeriod("last-12");
		const lookback = new Date(window.from);
		lookback.setUTCMonth(lookback.getUTCMonth() + 6);

		const [expenses, categories, rules] = await Promise.all([
			db.expense.findMany({
				where: {
					organizationId: input.organizationId,
					status: "APPROVED",
					createdAt: { gte: lookback },
					...(activeDealerId
						? { submittedBy: { dealerId: activeDealerId } }
						: {}),
				},
				select: {
					description: true,
					amount: true,
					createdAt: true,
					financeCategoryId: true,
				},
			}),
			db.financeCategory.findMany({
				where: {
					organizationId: input.organizationId,
					archivedAt: null,
				},
				orderBy: { sortOrder: "asc" },
				select: {
					id: true,
					label: true,
					labelAr: true,
					hint: true,
					kind: true,
				},
			}),
			db.financeRule.findMany({
				where: { organizationId: input.organizationId },
				select: { pattern: true, financeCategoryId: true },
			}),
		]);

		const ruleByPattern = new Map(
			rules.map((r) => [
				normaliseDescription(r.pattern),
				r.financeCategoryId,
			]),
		);

		const detected = detectRecurringLines(expenses).map((line) => ({
			...line,
			lastSeen: line.lastSeen.toISOString(),
			financeCategoryId:
				line.financeCategoryId ?? ruleByPattern.get(line.key) ?? null,
		}));

		const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);
		const classifiedSpend = detected
			.filter((l) => l.financeCategoryId)
			.reduce((sum, l) => sum + l.total, 0);

		return {
			categories,
			lines: detected,
			/** Drives the "your money map is X% complete" nudge. Measured by
			 *  VALUE, not row count — classifying the $52k upstream line matters
			 *  vastly more than classifying a $6 patch cord. */
			coverage: totalSpend > 0 ? classifiedSpend / totalSpend : 1,
			totalSpend,
			needsSetup: detected.some((l) => !l.financeCategoryId),
		};
	});

export const saveMoneyMap = protectedProcedure
	.route({
		method: "POST",
		path: "/finance/money-map",
		tags: ["Finance"],
		summary: "Classify spending lines and backfill matching history",
	})
	.input(
		z.object({
			organizationId: z.string(),
			assignments: z
				.array(
					z.object({
						/** Normalised line key, from `money-map.get`. */
						key: z.string().min(1),
						/** Original spelling, kept so the owner can recognise
						 *  which answer produced which rule later. */
						label: z.string().min(1),
						financeCategoryId: z.string().min(1),
					}),
				)
				.min(1)
				.max(200),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const categories = await db.financeCategory.findMany({
			where: {
				organizationId: input.organizationId,
				id: { in: input.assignments.map((a) => a.financeCategoryId) },
			},
			select: { id: true },
		});
		const valid = new Set(categories.map((c) => c.id));

		let rulesWritten = 0;
		let expensesBackfilled = 0;

		for (const assignment of input.assignments) {
			if (!valid.has(assignment.financeCategoryId)) {
				continue;
			}

			// One rule per line. Re-answering a line updates its rule rather
			// than stacking a second, contradictory one.
			const existing = await db.financeRule.findFirst({
				where: {
					organizationId: input.organizationId,
					pattern: assignment.key,
				},
				select: { id: true },
			});

			if (existing) {
				await db.financeRule.update({
					where: { id: existing.id },
					data: {
						financeCategoryId: assignment.financeCategoryId,
						createdFromLine: assignment.label,
					},
				});
			} else {
				await db.financeRule.create({
					data: {
						organizationId: input.organizationId,
						pattern: assignment.key,
						matchType: "contains",
						financeCategoryId: assignment.financeCategoryId,
						// Longer patterns are more specific, so they should win
						// ties against broad ones without the owner ordering
						// anything himself.
						priority: assignment.key.length,
						createdFromLine: assignment.label,
					},
				});
			}
			rulesWritten += 1;

			// Backfill history so the P&L is right retroactively, not just from
			// today. Without this the owner classifies his biggest line and the
			// past twelve months stay wrong.
			const candidates = await db.expense.findMany({
				where: {
					organizationId: input.organizationId,
					...(activeDealerId
						? { submittedBy: { dealerId: activeDealerId } }
						: {}),
				},
				select: { id: true, description: true },
			});

			const matchingIds = candidates
				.filter((e) =>
					normaliseDescription(e.description).includes(
						assignment.key,
					),
				)
				.map((e) => e.id);

			if (matchingIds.length > 0) {
				const updated = await db.expense.updateMany({
					where: { id: { in: matchingIds } },
					data: { financeCategoryId: assignment.financeCategoryId },
				});
				expensesBackfilled += updated.count;
			}
		}

		return { rulesWritten, expensesBackfilled };
	});

export const listFinanceCategories = protectedProcedure
	.route({
		method: "GET",
		path: "/finance/categories",
		tags: ["Finance"],
		summary: "Spending buckets for this organization",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);
		await ensureCategories(input.organizationId);

		const categories = await db.financeCategory.findMany({
			where: { organizationId: input.organizationId, archivedAt: null },
			orderBy: { sortOrder: "asc" },
			select: {
				id: true,
				label: true,
				labelAr: true,
				hint: true,
				kind: true,
			},
		});

		return { categories };
	});
