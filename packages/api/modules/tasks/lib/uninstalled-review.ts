import { ORPCError } from "@orpc/server";
import type { Prisma } from "@repo/database";
import { decrementWorkerStock } from "../../installations/lib/stock-guard";

interface PendingUninstalledItem {
	id: string;
	organizationId: string;
	stockItemId: string | null;
	itemName: string;
	quantity: number;
	employeeId: string | null;
}

/**
 * Approve a pending recovered item inside a transaction: credit the
 * recovering worker's stock (or the central warehouse for legacy rows with no
 * worker) and mark the item APPROVED. Shared by the Recovered review panel
 * and the task-completion approval.
 *
 * The item is claimed first (PENDING → APPROVED, conditional on the status),
 * so a concurrent review of the same item throws CONFLICT instead of crediting
 * the stock twice.
 */
export async function approveUninstalledItemInTx(
	tx: Prisma.TransactionClient,
	item: PendingUninstalledItem,
	options: {
		userId: string;
		quantity?: number | undefined;
		// Admin correction of a typo'd name; takes precedence over stockItemId.
		itemName?: string | undefined;
		// Value per unit (defaults to the stock item's sellPrice). 0 = the
		// company covers it — the worker's accountable stock value doesn't grow.
		unitPrice?: number | undefined;
	},
) {
	const quantity = options.quantity ?? item.quantity;
	const itemName = options.itemName?.trim() || item.itemName;

	let stockItem =
		item.stockItemId && !options.itemName
			? await tx.stockItem.findFirst({
					where: {
						id: item.stockItemId,
						organizationId: item.organizationId,
					},
					select: { id: true, name: true, sellPrice: true },
				})
			: null;
	if (!stockItem) {
		stockItem = await tx.stockItem.findFirst({
			where: {
				organizationId: item.organizationId,
				name: { equals: itemName, mode: "insensitive" },
			},
			select: { id: true, name: true, sellPrice: true },
		});
	}
	if (!stockItem) {
		throw new ORPCError("BAD_REQUEST", {
			message: `No stock item matches "${itemName}" — create it in Stock first, then approve`,
		});
	}

	const claimed = await tx.uninstalledItem.updateMany({
		where: { id: item.id, status: "PENDING" },
		data: { status: "APPROVED" },
	});
	if (claimed.count !== 1) {
		throw new ORPCError("CONFLICT", {
			message:
				"This recovered item was already reviewed — refresh the list",
		});
	}

	const unitPrice = options.unitPrice ?? stockItem.sellPrice;

	// The recovering worker physically holds the gear, so approval credits
	// THEIR stock. Legacy synced rows carry no employee — fall back to the
	// central admin warehouse so those still resolve.
	if (item.employeeId) {
		const existing = await tx.workerStock.findUnique({
			where: {
				stockItemId_employeeId: {
					stockItemId: stockItem.id,
					employeeId: item.employeeId,
				},
			},
			select: { quantity: true, unitPrice: true },
		});
		const workerBefore = existing?.quantity ?? 0;
		// WorkerStock carries one price per (item, worker), but the worker's
		// accountable value is quantity × unitPrice — so blend the recovered
		// units in at the reviewed price via a weighted average. Existing
		// holdings keep their value; the total grows by exactly
		// quantity × unitPrice (0 when the company covers the recovered gear).
		const blendedUnitPrice =
			Math.round(
				((workerBefore * (existing?.unitPrice ?? 0) +
					quantity * unitPrice) /
					(workerBefore + quantity)) *
					100,
			) / 100;
		await tx.workerStock.upsert({
			where: {
				stockItemId_employeeId: {
					stockItemId: stockItem.id,
					employeeId: item.employeeId,
				},
			},
			create: {
				stockItemId: stockItem.id,
				employeeId: item.employeeId,
				quantity,
				unitPrice,
			},
			update: {
				quantity: { increment: quantity },
				unitPrice: blendedUnitPrice,
			},
		});
		await tx.stockLog.create({
			data: {
				organizationId: item.organizationId,
				stockItemId: stockItem.id,
				employeeId: item.employeeId,
				performedById: options.userId,
				action: "TRANSFER_TO_WORKER",
				itemName: stockItem.name,
				quantity,
				workerQtyBefore: workerBefore,
				workerQtyAfter: workerBefore + quantity,
				notes: `Recovered equipment approved (item ${item.id}) at $${unitPrice}/unit`,
			},
		});
	} else {
		const stockUpdated = await tx.stockItem.update({
			where: { id: stockItem.id },
			data: { quantity: { increment: quantity } },
		});
		await tx.stockLog.create({
			data: {
				organizationId: item.organizationId,
				stockItemId: stockItem.id,
				employeeId: null,
				performedById: options.userId,
				action: "TRANSFER_FROM_WORKER",
				itemName: stockItem.name,
				quantity,
				adminQtyBefore: stockUpdated.quantity - quantity,
				adminQtyAfter: stockUpdated.quantity,
				notes: `Recovered equipment approved (item ${item.id})`,
			},
		});
	}

	const updated = await tx.uninstalledItem.update({
		where: { id: item.id },
		data: {
			quantity,
			itemName: stockItem.name,
			stockItemId: stockItem.id,
			reviewedById: options.userId,
			reviewedAt: new Date(),
		},
	});
	return { item: updated, stockItem, quantity };
}

/**
 * Inverse of `approveUninstalledItemInTx`, used when a task completion is
 * rejected: take the recovered units back out of the worker's stock (or the
 * central warehouse) and mark the item DENIED.
 *
 * Throws CONFLICT when the worker no longer holds the units (already used or
 * handed back) — the admin must adjust stock first.
 *
 * The worker's WorkerStock.unitPrice was blended at approval and cannot be
 * un-blended exactly (the pre-approval price isn't stored). It is left as is;
 * the value difference is at most one blend step.
 */
export async function revertApprovedUninstalledItem(
	tx: Prisma.TransactionClient,
	itemId: string,
	userId: string,
): Promise<void> {
	const item = await tx.uninstalledItem.findUnique({
		where: { id: itemId },
		select: {
			id: true,
			organizationId: true,
			status: true,
			stockItemId: true,
			itemName: true,
			quantity: true,
			employeeId: true,
		},
	});
	if (!item || item.status !== "APPROVED") {
		return;
	}

	if (item.stockItemId) {
		const note = `Reverted — task completion rejected (recovered item ${item.id})`;
		if (item.employeeId) {
			const moved = await decrementWorkerStock(tx, {
				stockItemId: item.stockItemId,
				employeeId: item.employeeId,
				quantity: item.quantity,
			});
			if (!moved) {
				const employee = await tx.employee.findUnique({
					where: { id: item.employeeId },
					select: { name: true },
				});
				throw new ORPCError("CONFLICT", {
					message: `${item.itemName} ×${item.quantity} from this task is no longer in ${employee?.name ?? "the worker"}'s stock — adjust stock first`,
				});
			}
			await tx.stockLog.create({
				data: {
					organizationId: item.organizationId,
					stockItemId: item.stockItemId,
					employeeId: item.employeeId,
					performedById: userId,
					action: "REMOVE",
					itemName: item.itemName,
					quantity: item.quantity,
					workerQtyBefore: moved.before,
					workerQtyAfter: moved.after,
					notes: note,
				},
			});
		} else {
			const { count } = await tx.stockItem.updateMany({
				where: {
					id: item.stockItemId,
					quantity: { gte: item.quantity },
				},
				data: { quantity: { decrement: item.quantity } },
			});
			if (count !== 1) {
				throw new ORPCError("CONFLICT", {
					message: `${item.itemName} ×${item.quantity} from this task is no longer in the warehouse stock — adjust stock first`,
				});
			}
			const after = await tx.stockItem.findUniqueOrThrow({
				where: { id: item.stockItemId },
				select: { quantity: true },
			});
			await tx.stockLog.create({
				data: {
					organizationId: item.organizationId,
					stockItemId: item.stockItemId,
					employeeId: null,
					performedById: userId,
					action: "REMOVE",
					itemName: item.itemName,
					quantity: item.quantity,
					adminQtyBefore: after.quantity + item.quantity,
					adminQtyAfter: after.quantity,
					notes: note,
				},
			});
		}
	}

	await tx.uninstalledItem.update({
		where: { id: item.id },
		data: {
			status: "DENIED",
			reviewedById: userId,
			reviewedAt: new Date(),
		},
	});
}
