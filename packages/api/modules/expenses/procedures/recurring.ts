import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { generateRecurringExpenseFor } from "@repo/jobs/recurring-expenses";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { bustExpenseStats } from "../lib/stats-cache";

const lineFields = {
	amount: z.number().positive(),
	description: z.string().trim().min(1).max(2000),
	financeCategoryId: z.string().nullable(),
	/** 1–28 so every month has the day. */
	dayOfMonth: z.number().int().min(1).max(28),
};

async function requireOperator(organizationId: string, userId: string) {
	await requirePermission(organizationId, userId, "expenses", "approve");
}

async function assertBucket(organizationId: string, id: string | null) {
	if (!id) {
		return;
	}
	const bucket = await db.financeCategory.findFirst({
		where: { id, organizationId },
		select: { id: true },
	});
	if (!bucket) {
		throw new ORPCError("NOT_FOUND", { message: "Bucket not found" });
	}
}

/**
 * A cost that comes back every month. Creating one can also file this
 * month's row immediately, so a line added on the 4th for "day 1" shows up
 * today instead of next month.
 */
export const createRecurringExpense = protectedProcedure
	.route({
		method: "POST",
		path: "/expenses/recurring",
		tags: ["Expenses"],
		summary: "Add a monthly recurring expense",
	})
	.input(
		z.object({
			organizationId: z.string(),
			...lineFields,
			includeCurrentMonth: z.boolean().default(true),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requireOperator(input.organizationId, user.id);
		await assertBucket(input.organizationId, input.financeCategoryId);
		const line = await db.recurringExpense.create({
			data: {
				organizationId: input.organizationId,
				amount: input.amount,
				description: input.description,
				financeCategoryId: input.financeCategoryId,
				dayOfMonth: input.dayOfMonth,
				createdById: user.id,
			},
		});
		let generated = false;
		if (input.includeCurrentMonth) {
			generated = await generateRecurringExpenseFor(line);
			bustExpenseStats();
		}
		return { line, generated };
	});

export const updateRecurringExpense = protectedProcedure
	.route({
		method: "PATCH",
		path: "/expenses/recurring/{id}",
		tags: ["Expenses"],
		summary: "Edit or pause a recurring expense",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			amount: lineFields.amount.optional(),
			description: lineFields.description.optional(),
			financeCategoryId: lineFields.financeCategoryId.optional(),
			dayOfMonth: lineFields.dayOfMonth.optional(),
			active: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requireOperator(input.organizationId, user.id);
		const existing = await db.recurringExpense.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Recurring expense not found",
			});
		}
		if (input.financeCategoryId !== undefined) {
			await assertBucket(input.organizationId, input.financeCategoryId);
		}
		const data: Record<string, unknown> = {};
		for (const key of [
			"amount",
			"description",
			"financeCategoryId",
			"dayOfMonth",
			"active",
		] as const) {
			if (input[key] !== undefined) {
				data[key] = input[key];
			}
		}
		const line = await db.recurringExpense.update({
			where: { id: input.id },
			data,
		});
		return { line };
	});

/** Removes the line only; the expenses it already generated stay on the books. */
export const deleteRecurringExpense = protectedProcedure
	.route({
		method: "DELETE",
		path: "/expenses/recurring/{id}",
		tags: ["Expenses"],
		summary: "Delete a recurring expense",
	})
	.input(z.object({ organizationId: z.string(), id: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		await requireOperator(input.organizationId, user.id);
		const deleted = await db.recurringExpense.deleteMany({
			where: { id: input.id, organizationId: input.organizationId },
		});
		if (deleted.count === 0) {
			throw new ORPCError("NOT_FOUND", {
				message: "Recurring expense not found",
			});
		}
		return { success: true };
	});
