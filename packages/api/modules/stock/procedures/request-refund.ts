import { ORPCError } from "@orpc/server";
import { notifyOrgForReview } from "@repo/api/lib/notify-employee";
import { getUserEmployeeId, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { loadStockReservations } from "../../installations/lib/stock-guard";

export const requestStockRefund = protectedProcedure
	.route({
		method: "POST",
		path: "/stock/items/{stockItemId}/request-refund",
		tags: ["Stock"],
		summary: "Request a refund (return) on stock the worker holds",
	})
	.input(
		z.object({
			organizationId: z.string(),
			stockItemId: z.string(),
			quantity: z.number().int().min(1),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"inventory",
			"read",
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

		const allocation = await db.workerStock.findUnique({
			where: {
				stockItemId_employeeId: {
					stockItemId: input.stockItemId,
					employeeId,
				},
			},
			select: {
				quantity: true,
				unitPrice: true,
				stockItem: {
					select: { id: true, name: true, organizationId: true },
				},
			},
		});
		if (
			!allocation ||
			allocation.stockItem.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "You don't hold any of this item",
			});
		}

		// Cap the request to what the worker still holds minus what is already
		// committed — refunds awaiting review and pending install lines — so
		// the same units can't be both installed and handed back.
		const { pendingInstalls, pendingRefunds } = await loadStockReservations(
			db,
			{ employeeId, stockItemIds: [input.stockItemId] },
		);
		const alreadyRefunding = pendingRefunds.get(input.stockItemId) ?? 0;
		const onInstalls = pendingInstalls.get(input.stockItemId) ?? 0;
		const refundable = allocation.quantity - alreadyRefunding - onInstalls;
		if (input.quantity > refundable) {
			const committed = [
				alreadyRefunding > 0
					? `${alreadyRefunding} on pending refunds`
					: null,
				onInstalls > 0 ? `${onInstalls} on pending installs` : null,
			]
				.filter(Boolean)
				.join(", ");
			throw new ORPCError("CONFLICT", {
				message:
					refundable <= 0
						? `All ${allocation.quantity} × ${allocation.stockItem.name} you hold are already committed (${committed})`
						: `You can request a refund for at most ${refundable} × ${allocation.stockItem.name}${committed ? ` (${committed})` : ""}`,
			});
		}

		const request = await db.stockRefundRequest.create({
			data: {
				organizationId: input.organizationId,
				stockItemId: input.stockItemId,
				employeeId,
				quantity: input.quantity,
				unitPrice: allocation.unitPrice,
				notes: input.notes ?? null,
			},
			include: {
				employee: { select: { id: true, name: true } },
				stockItem: { select: { id: true, name: true } },
			},
		});

		const org = await db.organization.findFirst({
			where: { id: input.organizationId },
			select: { slug: true },
		});
		notifyOrgForReview({
			organizationId: input.organizationId,
			title: "Stock refund to approve",
			message: `${request.employee.name} requested to return ${input.quantity} × ${request.stockItem.name}`,
			link: `/app/${org?.slug ?? ""}/stock`,
			excludeUserIds: [user.id],
		}).catch((err: unknown) =>
			logger.warn("[Stock Refund Request] notify failed", {
				error: String(err),
			}),
		);

		return { request };
	});
