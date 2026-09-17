import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { bustCashStats } from "../lib/cash-cache";
import { handoffAmount } from "../lib/cash-signs";

export const createCollection = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/collections",
		tags: ["Billing"],
		summary: "Record a cash handoff from a collector",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string(),
			amount: z.number().finite().positive(),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		// Verify collector exists, is active, and belongs to active dealer if scoped
		const collector = await db.employee.findFirst({
			where: {
				id: input.collectorId,
				organizationId: input.organizationId,
				status: "ACTIVE",
				deletedAt: null,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!collector) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collector not found or inactive",
			});
		}

		const note = input.notes?.trim() || undefined;

		const collection = await db.cashCollection.create({
			data: {
				organizationId: input.organizationId,
				collectorId: input.collectorId,
				amount: handoffAmount(input.amount),
				notes: note ?? null,
				type: "HANDOFF",
				receivedById: user.id,
			},
			include: {
				collector: { select: { id: true, name: true } },
			},
		});

		bustCashStats(input.organizationId);

		const amountLabel = `$${input.amount.toFixed(2)}`;
		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: input.collectorId,
			title: "Handoff recorded",
			message: `The office recorded ${amountLabel} handed in by you${note ? ` — ${note}` : ""}.`,
			type: "success",
			telegramText: tgMessage({
				icon: "🤝",
				title: "Handoff recorded",
				fields: [
					{
						icon: "💰",
						label: "Amount",
						value: amountLabel,
						copyable: true,
					},
					user.name
						? { icon: "👤", label: "Received by", value: user.name }
						: null,
					note ? { icon: "✍️", label: "Note", value: note } : null,
				],
			}),
		}).catch((err: unknown) =>
			logger.warn("[Billing] handoff notify failed", {
				error: String(err),
			}),
		);

		return { collection };
	});
