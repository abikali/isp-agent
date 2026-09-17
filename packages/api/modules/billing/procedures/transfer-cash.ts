import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { cashAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { getRedisConnection } from "@repo/jobs";
import { logger } from "@repo/logs";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { bustCashStats } from "../lib/cash-cache";
import { transferInAmount, transferOutAmount } from "../lib/cash-signs";

/**
 * Move cash from one staff member to another in one step — e.g. a collector
 * hands his round's cash to the company cashier (a worker account).
 *
 * Before this, the office recorded a HANDOFF on the sender and a CASH_FLOAT on
 * the receiver. The HANDOFF counted as cash that "reached the office" on the
 * Money page while the receiver's float still counted as cash "in team
 * hands", so every such move was counted twice.
 *
 * Now it is one pair of ADMIN_TRANSFER rows sharing a `transferId`: + on the
 * sender (cash leaves his pocket), − on the receiver (cash enters his). The
 * pair nets to zero, so total cash held is unchanged, nothing reaches the
 * office, and it is never revenue or cost (ADMIN_TRANSFER is a TRANSFER in
 * the money model). Deleting either leg removes both.
 *
 * Moving more than the sender holds is allowed — balances drift from real
 * life and the owner is the judge; the UI warns before submitting.
 */
export const transferCash = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/collections/transfer",
		tags: ["Billing"],
		summary: "Move cash from one staff member to another",
	})
	.input(
		z.object({
			organizationId: z.string(),
			fromEmployeeId: z.string(),
			toEmployeeId: z.string(),
			// Balances are float sums; money moves in whole cents. Rounded
			// here so both legs and the double-submit key use the same value.
			amount: z
				.number()
				.finite()
				.max(1_000_000)
				.transform((v) => Math.round(v * 100) / 100)
				.refine((v) => v >= 0.01, {
					message: "Amount must be at least $0.01",
				}),
			notes: z.string().trim().max(400).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		if (input.fromEmployeeId === input.toEmployeeId) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Pick two different people to move cash between.",
			});
		}

		// Same dealer scope for both — a move never crosses dealers.
		const employees = await db.employee.findMany({
			where: {
				id: { in: [input.fromEmployeeId, input.toEmployeeId] },
				organizationId: input.organizationId,
				status: "ACTIVE",
				deletedAt: null,
				...getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				name: true,
				username: true,
				telegramChatId: true,
			},
		});
		const from = employees.find((e) => e.id === input.fromEmployeeId);
		const to = employees.find((e) => e.id === input.toEmployeeId);
		if (!from || !to) {
			throw new ORPCError("NOT_FOUND", {
				message:
					"One of the two staff members is not found or inactive",
			});
		}

		const lockKey = await acquireTransferLock(input);

		const fromName = from.name || from.username || "staff";
		const toName = to.name || to.username || "staff";
		const note = input.notes || undefined;
		const withNote = (text: string) => (note ? `${text} — ${note}` : text);
		const transferId = randomUUID();
		const collectedAt = new Date();

		try {
			await db.$transaction([
				db.cashCollection.create({
					data: {
						organizationId: input.organizationId,
						collectorId: from.id,
						amount: transferOutAmount(input.amount),
						type: "ADMIN_TRANSFER",
						transferId,
						receivedById: user.id,
						collectedAt,
						notes: withNote(`To ${toName}`),
					},
				}),
				db.cashCollection.create({
					data: {
						organizationId: input.organizationId,
						collectorId: to.id,
						amount: transferInAmount(input.amount),
						type: "ADMIN_TRANSFER",
						transferId,
						receivedById: user.id,
						collectedAt,
						notes: withNote(`From ${fromName}`),
					},
				}),
			]);
		} catch (error) {
			await releaseTransferLock(lockKey);
			throw error;
		}

		bustCashStats(input.organizationId);
		cashAudit.transferred(
			transferId,
			user.id,
			input.organizationId,
			getAuditContextFromHeaders(headers),
			{
				fromEmployeeId: from.id,
				toEmployeeId: to.id,
				amount: input.amount,
				note: note ?? null,
			},
		);

		const amountLabel = `$${input.amount.toFixed(2)}`;
		const telegramText = (title: string) =>
			tgMessage({
				icon: "🔁",
				title,
				fields: [
					{
						icon: "💰",
						label: "Amount",
						value: amountLabel,
						copyable: true,
					},
					{ icon: "📤", label: "From", value: fromName },
					{ icon: "📥", label: "To", value: toName },
					note ? { icon: "✍️", label: "Note", value: note } : null,
				],
			});
		// One person with two employee records (collector + worker) on the
		// same Telegram chat gets one message, not two.
		const sameChat =
			from.telegramChatId !== null &&
			from.telegramChatId === to.telegramChatId;

		for (const notification of [
			{
				employeeId: from.id,
				title: "Cash moved out",
				message: withNote(
					`${amountLabel} was moved from your cash in hand to ${toName}.`,
				),
				skipTelegram: sameChat,
			},
			{
				employeeId: to.id,
				title: "Cash received",
				message: withNote(
					`${amountLabel} from ${fromName} was added to your cash in hand.`,
				),
				skipTelegram: false,
			},
		]) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: notification.employeeId,
				title: notification.title,
				message: notification.message,
				type: "info",
				skipTelegram: notification.skipTelegram,
				telegramText: telegramText(
					sameChat ? "Cash moved" : notification.title,
				),
			}).catch((err: unknown) =>
				logger.warn("[Billing] cash transfer notify failed", {
					error: String(err),
				}),
			);
		}

		return {
			transferId,
			amount: input.amount,
			from: { id: from.id, name: fromName },
			to: { id: to.id, name: toName },
		};
	});

// ─── Double-submit guard ─────────────────────────────────────────────
//
// Same idea as dealers/lib/write-guard.ts: two identical moves in flight at
// once both pass every check, so the move's identity is fenced in Redis for a
// short window and the second request is refused.

const LOCK_WINDOW_SECONDS = 60;

async function acquireTransferLock(parts: {
	organizationId: string;
	fromEmployeeId: string;
	toEmployeeId: string;
	amount: number;
}): Promise<string | null> {
	const key = `cash-transfer:${parts.organizationId}:${parts.fromEmployeeId}:${parts.toEmployeeId}:${parts.amount.toFixed(2)}`;
	try {
		const result = await getRedisConnection().set(
			key,
			String(Date.now()),
			"EX",
			LOCK_WINDOW_SECONDS,
			"NX",
		);
		if (result !== "OK") {
			throw new ORPCError("CONFLICT", {
				message:
					"The same cash move was recorded moments ago. If you really mean to record it again, wait a minute.",
			});
		}
		return key;
	} catch (error) {
		if (error instanceof ORPCError) {
			throw error;
		}
		// Redis down: don't block money work on a cache outage — the client
		// disables the button while the request runs.
		logger.warn("[Billing] cash transfer guard unavailable, proceeding", {
			error,
		});
		return null;
	}
}

async function releaseTransferLock(key: string | null) {
	if (!key) {
		return;
	}
	try {
		await getRedisConnection().del(key);
	} catch {
		// It expires on its own.
	}
}
