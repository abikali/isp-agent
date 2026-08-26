import { ORPCError } from "@orpc/server";
import { notifyOrgForReview } from "@repo/api/lib/notify-employee";
import { getUserEmployeeId, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { matchRule } from "../../finance/lib/classify";

/** Apply the org's money map to a free-text description. Returns null when
 *  nothing matches — an unclassified expense is reported as unclassified
 *  rather than guessed into a bucket. */
async function resolveCategoryFromRules(
	organizationId: string,
	description: string,
): Promise<string | null> {
	const rules = await db.financeRule.findMany({
		where: { organizationId },
		select: {
			id: true,
			pattern: true,
			matchType: true,
			financeCategoryId: true,
			priority: true,
		},
	});
	return matchRule(description, rules)?.financeCategoryId ?? null;
}

export const createExpense = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses",
		tags: ["Expenses"],
		summary: "Submit an expense claim",
	})
	.input(
		z.object({
			organizationId: z.string(),
			amount: z.number().positive(),
			description: z.string().min(1).max(2000),
			category: z.string().max(100).optional(),
			/** FinanceCategory id — the bucket this spending belongs to.
			 *  Preferred over the legacy free-text `category`, which ended up
			 *  holding upstream bandwidth, office rent and pliers under the
			 *  single value "toolkit". */
			financeCategoryId: z.string().optional(),
			receiptUrl: z.string().max(1000).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"create",
		);

		const employeeId = await getUserEmployeeId(
			input.organizationId,
			user.id,
		);
		if (!employeeId) {
			throw new ORPCError("FORBIDDEN", {
				message: "No employee record linked to your account",
			});
		}

		// Resolve the bucket now, at entry: explicit pick first, otherwise the
		// org's money-map rules. Classifying here rather than at read time means
		// the owner's answers keep working even if a rule is later edited, and
		// the P&L never has to guess.
		const financeCategoryId =
			input.financeCategoryId ??
			(await resolveCategoryFromRules(
				input.organizationId,
				input.description,
			));

		const expense = await db.expense.create({
			data: {
				organizationId: input.organizationId,
				submittedById: employeeId,
				amount: input.amount,
				description: input.description,
				category: input.category ?? null,
				financeCategoryId: financeCategoryId ?? null,
				receiptUrl: input.receiptUrl ?? null,
			},
			include: {
				submittedBy: { select: { id: true, name: true } },
			},
		});

		const org = await db.organization.findFirst({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		notifyOrgForReview({
			organizationId: input.organizationId,
			title: "New expense to approve",
			message: `${expense.submittedBy.name} submitted a $${input.amount.toFixed(2)} expense`,
			link: `/app/${org?.slug ?? ""}/expenses`,
			excludeUserIds: [user.id],
		}).catch((err: unknown) =>
			logger.warn("[Expense Create] notify failed", {
				error: String(err),
			}),
		);

		return { expense };
	});
