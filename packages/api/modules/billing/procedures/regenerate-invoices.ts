import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import z from "zod";
import { adminProcedure } from "../../../orpc/procedures";
import { generateInvoicesForMonth } from "../lib/generate-invoices";

/**
 * Backfill missing `customer_invoice` rows for an unlocked billing month.
 *
 * The auto-generator runs once on first cycle creation. If customers are
 * synced into an org *after* the cycle was opened (e.g. the org was created
 * before its iRadius sync ran), those customers end up with no invoice for
 * the active month. This procedure replays the generator over the existing
 * cycle. `skipDuplicates` on the underlying createMany makes it safe to
 * re-run.
 *
 * Platform-admin only — org owners cannot run it.
 */
const REGENERATE_CONFIRMATION = "REGENERATE";

export const regenerateMonthInvoices = adminProcedure
	.route({
		method: "POST",
		path: "/billing/months/{billingMonthId}/regenerate-invoices",
		tags: ["Billing"],
		summary: "Regenerate invoices for an unlocked billing month",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingMonthId: z.string(),
			confirmation: z.literal(REGENERATE_CONFIRMATION),
		}),
	)
	.handler(async ({ input }) => {
		const month = await db.billingMonth.findFirst({
			where: {
				id: input.billingMonthId,
				organizationId: input.organizationId,
			},
		});
		if (!month) {
			throw new ORPCError("NOT_FOUND", {
				message: "Billing month not found",
			});
		}
		if (month.locked) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message:
					"Cannot regenerate invoices for a locked month. Unlock it first.",
			});
		}

		const result = await generateInvoicesForMonth(
			db,
			input.organizationId,
			month.year,
			month.month,
		);
		return { ...result, year: month.year, month: month.month };
	});
