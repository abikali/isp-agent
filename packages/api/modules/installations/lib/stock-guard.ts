import { ORPCError } from "@orpc/server";
import type { Prisma } from "@repo/database";

/**
 * Refuse a worker submission that uses more of an item than he holds.
 *
 * Runs at SUBMISSION time so the worker sees the shortfall while he can still
 * fix it (lower the quantity, ask for a delivery). The approval-time guard in
 * `installations/procedures/review.ts` stays as the hard stop, but a worker
 * who only learns about it from the admin's rejection days later has already
 * left the site — najibabboud's setup listed 28 m of cable against 24 held
 * and blocked the whole approval.
 *
 * Add-on lines carry no stock and are ignored. Quantities are summed per item
 * so two lines of the same cable cannot each pass individually.
 */
export async function assertWorkerHoldsStockLines(
	client: Prisma.TransactionClient,
	employeeId: string,
	lines: Array<{ stockItemId?: string | null | undefined; quantity: number }>,
): Promise<void> {
	const needed = new Map<string, number>();
	for (const line of lines) {
		if (!line.stockItemId) {
			continue;
		}
		needed.set(
			line.stockItemId,
			(needed.get(line.stockItemId) ?? 0) + line.quantity,
		);
	}
	if (needed.size === 0) {
		return;
	}

	const allocations = await client.workerStock.findMany({
		where: { employeeId, stockItemId: { in: [...needed.keys()] } },
		select: {
			stockItemId: true,
			quantity: true,
			stockItem: { select: { name: true } },
		},
	});
	const held = new Map(
		allocations.map((a) => [
			a.stockItemId,
			{ quantity: a.quantity, name: a.stockItem.name },
		]),
	);
	const itemNames = await client.stockItem.findMany({
		where: { id: { in: [...needed.keys()] } },
		select: { id: true, name: true },
	});
	const nameOf = new Map(itemNames.map((i) => [i.id, i.name]));

	for (const [stockItemId, quantity] of needed) {
		const holding = held.get(stockItemId)?.quantity ?? 0;
		if (holding < quantity) {
			const name = nameOf.get(stockItemId) ?? "this item";
			throw new ORPCError("CONFLICT", {
				message: `You hold ${holding} × ${name} — cannot use ${quantity}. Lower the quantity or ask for a delivery first.`,
			});
		}
	}
}
