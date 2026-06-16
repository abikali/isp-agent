import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { installationCostAmount } from "../../billing/lib/cash-signs";
import { classifyAddonNote } from "../lib/addons";

export const updatePendingInstallation = protectedProcedure
	.route({
		method: "PATCH",
		path: "/installations/{id}",
		tags: ["Installations"],
		summary: "Edit price/quantity of a pending installation",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			price: z.number().min(0).optional(),
			quantity: z.number().int().min(1).optional(),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"update",
		);

		const installation = await db.installation.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				employee: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, status: true, isAddOn: true },
		});
		if (!installation) {
			throw new ORPCError("NOT_FOUND", {
				message: "Installation not found",
			});
		}
		if (installation.status !== "PENDING") {
			throw new ORPCError("CONFLICT", {
				message: "Only pending installations can be edited",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.price !== undefined) {
			updateData["price"] = input.price;
		}
		if (input.quantity !== undefined) {
			updateData["quantity"] = input.quantity;
		}
		if (input.notes !== undefined && !installation.isAddOn) {
			updateData["notes"] = input.notes;
		}

		const updated = await db.installation.update({
			where: { id: input.id },
			data: updateData,
		});

		return { installation: updated };
	});

/**
 * Approve a pending installation inside a transaction. Shared with the
 * customer setup-request approval (which approves the bundle without
 * per-line cash entries).
 *
 * Stock rule: worker stock decrements HERE (at approval), never at create.
 */
export async function approveInstallationInTx(
	tx: Prisma.TransactionClient,
	installation: {
		id: string;
		organizationId: string;
		employeeId: string;
		customerId: string | null;
		stockItemId: string | null;
		isAddOn: boolean;
		quantity: number;
		price: number;
		notes: string | null;
	},
	userId: string,
	options: { createCashEntry: boolean },
): Promise<void> {
	// Consume worker stock for physical items
	if (installation.stockItemId && !installation.isAddOn) {
		const allocation = await tx.workerStock.findUnique({
			where: {
				stockItemId_employeeId: {
					stockItemId: installation.stockItemId,
					employeeId: installation.employeeId,
				},
			},
			select: { id: true, quantity: true },
		});
		if (!allocation || allocation.quantity < installation.quantity) {
			throw new ORPCError("CONFLICT", {
				message: `Worker lacks stock for this item (holds ${allocation?.quantity ?? 0}, needs ${installation.quantity}) — deliver stock first or edit the quantity`,
			});
		}
		await tx.workerStock.update({
			where: { id: allocation.id },
			data: { quantity: { decrement: installation.quantity } },
		});
		const stockItem = await tx.stockItem.findUniqueOrThrow({
			where: { id: installation.stockItemId },
			select: { name: true },
		});
		await tx.stockLog.create({
			data: {
				organizationId: installation.organizationId,
				stockItemId: installation.stockItemId,
				employeeId: installation.employeeId,
				performedById: userId,
				action: "REMOVE",
				itemName: stockItem.name,
				quantity: installation.quantity,
				workerQtyBefore: allocation.quantity,
				workerQtyAfter: allocation.quantity - installation.quantity,
				notes: `Consumed by installation ${installation.id}`,
			},
		});
	}

	// Add-on approval updates the customer's recurring add-on price
	if (installation.isAddOn && installation.customerId) {
		const addonType = classifyAddonNote(installation.notes);
		if (addonType === "IPTV") {
			await tx.customer.update({
				where: { id: installation.customerId },
				data: { iptvPrice: installation.price },
			});
		} else if (addonType === "REAL_IP") {
			await tx.customer.update({
				where: { id: installation.customerId },
				data: { realIpPrice: installation.price },
			});
		}
	}

	// Cash ledger: hardware/add-on money the worker collected
	const total = installation.price * installation.quantity;
	if (options.createCashEntry && total > 0) {
		await tx.cashCollection.create({
			data: {
				organizationId: installation.organizationId,
				collectorId: installation.employeeId,
				amount: installationCostAmount(total),
				type: "INSTALLATION_COST",
				receivedById: userId,
				notes: `Approved installation ${installation.id}`,
			},
		});
	}

	await tx.installation.update({
		where: { id: installation.id },
		data: {
			status: "APPROVED",
			approvedById: userId,
			approvedAt: new Date(),
		},
	});
}

export const approveInstallations = protectedProcedure
	.route({
		method: "POST",
		path: "/installations/approve",
		tags: ["Installations"],
		summary: "Approve pending installations (consumes worker stock)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			ids: z.array(z.string()).min(1).max(50),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"approve",
		);

		const results: Array<{
			id: string;
			ok: boolean;
			error?: string;
		}> = [];
		const notifiedEmployees = new Set<string>();

		for (const id of input.ids) {
			try {
				await db.$transaction(async (tx) => {
					const installation = await tx.installation.findFirst({
						where: {
							id,
							organizationId: input.organizationId,
							status: "PENDING",
							employee: getDealerScopeFilter(activeDealerId),
						},
					});
					if (!installation) {
						throw new ORPCError("NOT_FOUND", {
							message: "Installation not found or not pending",
						});
					}
					await approveInstallationInTx(tx, installation, user.id, {
						createCashEntry: true,
					});
					notifiedEmployees.add(installation.employeeId);
				});
				results.push({ id, ok: true });
			} catch (error) {
				results.push({
					id,
					ok: false,
					error:
						error instanceof Error
							? error.message
							: "Approval failed",
				});
			}
		}

		for (const employeeId of notifiedEmployees) {
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId,
				title: "Installation approved",
				message: "Your installation submission was approved",
				type: "success",
			}).catch((err: unknown) =>
				logger.warn("[Installation Approve] notify failed", {
					error: String(err),
				}),
			);
		}

		return { results };
	});

export const denyInstallation = protectedProcedure
	.route({
		method: "POST",
		path: "/installations/{id}/deny",
		tags: ["Installations"],
		summary: "Deny a pending installation (no stock movement)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			reason: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"installations",
			"approve",
		);

		const installation = await db.installation.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: "PENDING",
				employee: getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, employeeId: true, notes: true },
		});
		if (!installation) {
			throw new ORPCError("NOT_FOUND", {
				message: "Installation not found or not pending",
			});
		}

		const updated = await db.installation.update({
			where: { id: installation.id },
			data: {
				status: "DENIED",
				approvedById: user.id,
				approvedAt: new Date(),
				...(input.reason
					? {
							notes: installation.notes
								? `${installation.notes} — Denied: ${input.reason}`
								: `Denied: ${input.reason}`,
						}
					: {}),
			},
		});

		notifyFieldEmployee({
			organizationId: input.organizationId,
			employeeId: installation.employeeId,
			title: "Installation denied",
			message: input.reason
				? `An installation was denied: ${input.reason}`
				: "An installation submission was denied",
			type: "warning",
		}).catch((err: unknown) =>
			logger.warn("[Installation Deny] notify failed", {
				error: String(err),
			}),
		);

		return { installation: updated };
	});
