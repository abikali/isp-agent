import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { openBillingMonth } from "../lib/open-month";

/**
 * Max age (minutes) of the latest successful iRadius sync for locking to be
 * allowed. Admins must re-sync before closing a month so that iRadius expiry
 * dates reflect the billing truth (not any proactive extensions). The next
 * month's invoices are generated using these expiry dates.
 */
const REQUIRED_SYNC_FRESHNESS_MINUTES = 30;

export const toggleMonthLock = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/months/toggle-lock",
		tags: ["Billing"],
		summary: "Lock a billing month and advance to the next one",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingMonthId: z.string(),
			locked: z.boolean(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

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

		if (!input.locked) {
			const updated = await db.billingMonth.update({
				where: { id: input.billingMonthId },
				data: { locked: false },
			});
			return { month: updated, nextMonth: null };
		}

		// Guard: require a fresh iRadius sync before locking. Invoice generation
		// for the next month reads each customer's live expiresAt as the billing
		// deadline, so the sync must have just pulled the pre-bump values.
		const latestSync = await db.iRadiusSyncOperation.findFirst({
			where: {
				organizationId: input.organizationId,
				status: "completed",
			},
			orderBy: { completedAt: "desc" },
			select: { completedAt: true },
		});
		const freshnessMs = REQUIRED_SYNC_FRESHNESS_MINUTES * 60 * 1000;
		const syncAgeOk =
			latestSync?.completedAt &&
			Date.now() - latestSync.completedAt.getTime() <= freshnessMs;
		if (!syncAgeOk) {
			throw new ORPCError("PRECONDITION_FAILED", {
				message: `Run a fresh iRadius sync before locking the month. Last successful sync must be within the past ${REQUIRED_SYNC_FRESHNESS_MINUTES} minutes.`,
			});
		}

		// Lock the current month and open the next one in a single transaction.
		// openBillingMonth generates invoices for the new month using each
		// customer's live expiresAt (guaranteed fresh by the guard above).
		const nextYear = month.month === 12 ? month.year + 1 : month.year;
		const nextMonthNum = month.month === 12 ? 1 : month.month + 1;

		const { updated, nextMonth } = await db.$transaction(async (tx) => {
			const updated = await tx.billingMonth.update({
				where: { id: input.billingMonthId },
				data: { locked: true },
			});
			const nextMonth = await openBillingMonth(
				tx,
				input.organizationId,
				nextYear,
				nextMonthNum,
			);
			return { updated, nextMonth };
		});

		return { month: updated, nextMonth };
	});
