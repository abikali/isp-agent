import { ORPCError } from "@orpc/server";
import type { Prisma } from "@repo/database";

/**
 * One aggregate stock guard for every path that commits a worker's stock:
 * submissions (worker new customer, task completion, installations.create),
 * pending-line edits, setup-request approval pre-flight, refund requests and
 * admin returns.
 *
 * Two lenses:
 * - `reserve: true` (submit / edit / refund) — what the worker can still
 *   commit: held − PENDING install lines − PENDING refund requests. Without
 *   this, two overlapping submissions can each claim the same 24 m of cable
 *   ("ma3o 24 yhot 24 ma ye2dar yhot 28", najibabboud 2026-09-10).
 * - `reserve: false` (approval) — only the physical holding. The lines being
 *   approved are themselves part of the reservation, and whichever pending
 *   line is approved first may consume the stock.
 *
 * Quantities are summed per item so two lines of the same cable cannot each
 * pass individually. Add-on lines (no stock item) are ignored.
 */

export interface StockLine {
	stockItemId?: string | null | undefined;
	quantity: number;
}

export interface StockShortfall {
	stockItemId: string;
	held: number;
	pendingInstalls: number;
	pendingRefunds: number;
	needed: number;
}

/** Sum line quantities per stock item (add-on lines skipped). */
export function sumLinesByItem(lines: StockLine[]): Map<string, number> {
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
	return needed;
}

/** Items whose needed quantity exceeds held − reservations. Pure. */
export function computeShortfalls(input: {
	needed: Map<string, number>;
	held: Map<string, number>;
	pendingInstalls?: Map<string, number>;
	pendingRefunds?: Map<string, number>;
}): StockShortfall[] {
	const shortfalls: StockShortfall[] = [];
	for (const [stockItemId, needed] of input.needed) {
		const held = input.held.get(stockItemId) ?? 0;
		const pendingInstalls = input.pendingInstalls?.get(stockItemId) ?? 0;
		const pendingRefunds = input.pendingRefunds?.get(stockItemId) ?? 0;
		if (held - pendingInstalls - pendingRefunds < needed) {
			shortfalls.push({
				stockItemId,
				held,
				pendingInstalls,
				pendingRefunds,
				needed,
			});
		}
	}
	return shortfalls;
}

/**
 * PENDING quantities already committed from a worker's stock, per item:
 * physical install lines (native only — legacy-synced rows carry an
 * `externalBillingId` and were never reserved against app stock) and refund
 * requests awaiting review.
 */
export async function loadStockReservations(
	client: Prisma.TransactionClient,
	opts: {
		employeeId: string;
		stockItemIds: string[];
		excludeInstallationIds?: string[] | undefined;
		excludeRefundRequestIds?: string[] | undefined;
	},
): Promise<{
	pendingInstalls: Map<string, number>;
	pendingRefunds: Map<string, number>;
}> {
	const [installs, refunds] = await Promise.all([
		client.installation.groupBy({
			by: ["stockItemId"],
			where: {
				employeeId: opts.employeeId,
				stockItemId: { in: opts.stockItemIds },
				status: "PENDING",
				isAddOn: false,
				externalBillingId: null,
				...(opts.excludeInstallationIds?.length
					? { id: { notIn: opts.excludeInstallationIds } }
					: {}),
			},
			_sum: { quantity: true },
		}),
		client.stockRefundRequest.groupBy({
			by: ["stockItemId"],
			where: {
				employeeId: opts.employeeId,
				stockItemId: { in: opts.stockItemIds },
				status: "PENDING",
				...(opts.excludeRefundRequestIds?.length
					? { id: { notIn: opts.excludeRefundRequestIds } }
					: {}),
			},
			_sum: { quantity: true },
		}),
	]);
	const pendingInstalls = new Map<string, number>();
	for (const row of installs) {
		if (row.stockItemId) {
			pendingInstalls.set(row.stockItemId, row._sum.quantity ?? 0);
		}
	}
	const pendingRefunds = new Map<string, number>();
	for (const row of refunds) {
		pendingRefunds.set(row.stockItemId, row._sum.quantity ?? 0);
	}
	return { pendingInstalls, pendingRefunds };
}

function reservationNote(s: StockShortfall, others: boolean): string {
	const parts: string[] = [];
	if (s.pendingInstalls > 0) {
		parts.push(
			`${s.pendingInstalls} already on ${others ? "other " : ""}pending installs`,
		);
	}
	if (s.pendingRefunds > 0) {
		parts.push(`${s.pendingRefunds} on pending refunds`);
	}
	return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/** User-facing refusal for one shortfall. Exported for tests. */
export function shortfallMessage(
	s: StockShortfall,
	opts: {
		itemName: string;
		audience: "worker" | "admin";
		employeeName?: string | undefined;
		hint?: string | undefined;
	},
): string {
	const available = Math.max(
		0,
		s.held - s.pendingInstalls - s.pendingRefunds,
	);
	const reserved = s.pendingInstalls + s.pendingRefunds > 0;
	if (opts.audience === "worker") {
		const hint =
			opts.hint ?? "Lower the quantity or ask for a delivery first.";
		return reserved
			? `You hold ${s.held} × ${opts.itemName}${reservationNote(s, false)}, so you can use ${available}, not ${s.needed}. ${hint}`
			: `You hold ${s.held} × ${opts.itemName}, so you cannot use ${s.needed}. ${hint}`;
	}
	const who = opts.employeeName ?? "The worker";
	const hint = opts.hint ?? "Deliver stock or lower the quantity.";
	return reserved
		? `${who} holds ${s.held} × ${opts.itemName}${reservationNote(s, true)}, so only ${available} are free — this needs ${s.needed}. ${hint}`
		: `${who} holds ${s.held} × ${opts.itemName} — this needs ${s.needed}. ${hint}`;
}

/**
 * Throw CONFLICT naming the first item the worker cannot cover. See the file
 * header for the `reserve` semantics.
 */
export async function assertStockAvailable(
	client: Prisma.TransactionClient,
	opts: {
		employeeId: string;
		lines: StockLine[];
		reserve: boolean;
		audience: "worker" | "admin";
		excludeInstallationIds?: string[] | undefined;
		excludeRefundRequestIds?: string[] | undefined;
		hint?: string | undefined;
	},
): Promise<void> {
	const needed = sumLinesByItem(opts.lines);
	if (needed.size === 0) {
		return;
	}
	const stockItemIds = [...needed.keys()];

	const [allocations, reservations] = await Promise.all([
		client.workerStock.findMany({
			where: {
				employeeId: opts.employeeId,
				stockItemId: { in: stockItemIds },
			},
			select: { stockItemId: true, quantity: true },
		}),
		opts.reserve
			? loadStockReservations(client, {
					employeeId: opts.employeeId,
					stockItemIds,
					excludeInstallationIds: opts.excludeInstallationIds,
					excludeRefundRequestIds: opts.excludeRefundRequestIds,
				})
			: null,
	]);

	const [shortfall] = computeShortfalls({
		needed,
		held: new Map(allocations.map((a) => [a.stockItemId, a.quantity])),
		...(reservations ?? {}),
	});
	if (!shortfall) {
		return;
	}

	const [item, employee] = await Promise.all([
		client.stockItem.findUnique({
			where: { id: shortfall.stockItemId },
			select: { name: true },
		}),
		opts.audience === "admin"
			? client.employee.findUnique({
					where: { id: opts.employeeId },
					select: { name: true },
				})
			: null,
	]);
	throw new ORPCError("CONFLICT", {
		message: shortfallMessage(shortfall, {
			itemName: item?.name ?? "this item",
			audience: opts.audience,
			employeeName: employee?.name,
			hint: opts.hint,
		}),
	});
}

/**
 * Atomically take `quantity` of an item from a worker's stock. The
 * conditional `updateMany` (quantity >= needed) makes read-then-decrement
 * races impossible: two concurrent approvals cannot both pass on the same
 * units. Returns the before/after quantities for the stock log, or null when
 * the worker holds too little (caller decides how to refuse).
 */
export async function decrementWorkerStock(
	tx: Prisma.TransactionClient,
	opts: { stockItemId: string; employeeId: string; quantity: number },
): Promise<{ before: number; after: number } | null> {
	const { count } = await tx.workerStock.updateMany({
		where: {
			stockItemId: opts.stockItemId,
			employeeId: opts.employeeId,
			quantity: { gte: opts.quantity },
		},
		data: { quantity: { decrement: opts.quantity } },
	});
	if (count !== 1) {
		return null;
	}
	const row = await tx.workerStock.findUniqueOrThrow({
		where: {
			stockItemId_employeeId: {
				stockItemId: opts.stockItemId,
				employeeId: opts.employeeId,
			},
		},
		select: { quantity: true },
	});
	return { before: row.quantity + opts.quantity, after: row.quantity };
}
