import type { Prisma } from "@repo/database";
import {
	approveInstallationInTx,
	revertApprovedInstallation,
} from "../../installations/procedures/review";
import {
	approveUninstalledItemInTx,
	revertApprovedUninstalledItem,
} from "./uninstalled-review";

/** The task's installation lines as review-completion loads them. */
export interface TaskInstallationLine {
	id: string;
	status: string;
	isAddOn: boolean;
	notes: string | null;
	price: number;
	quantity: number;
	stockItemId: string | null;
	employeeId: string;
	customerId: string | null;
	organizationId: string;
	setupRequestId: string | null;
	setupRequest: { status: string } | null;
}

/** The task's recovered-item lines as review-completion loads them. */
export interface TaskRecoveredLine {
	id: string;
	organizationId: string;
	status: string;
	stockItemId: string | null;
	employeeId: string | null;
	quantity: number;
	itemName: string;
}

export const TASK_LINES_SELECT = {
	installations: {
		select: {
			id: true,
			status: true,
			isAddOn: true,
			notes: true,
			price: true,
			quantity: true,
			stockItemId: true,
			employeeId: true,
			customerId: true,
			organizationId: true,
			setupRequestId: true,
			setupRequest: { select: { status: true } },
		},
	},
	uninstalledItems: {
		select: {
			id: true,
			organizationId: true,
			status: true,
			stockItemId: true,
			employeeId: true,
			quantity: true,
			itemName: true,
		},
	},
} as const;

/**
 * Pending lines an approval of the task would approve. Lines of a pending
 * new-customer setup are left to the setup approval (which consumes their
 * stock once, as a bundle) — mirrors the guard in `approveInstallations`.
 */
export function approvableTaskLines(lines: {
	installations: TaskInstallationLine[];
	uninstalledItems: TaskRecoveredLine[];
}) {
	const pending = lines.installations.filter((l) => l.status === "PENDING");
	return {
		installations: pending.filter(
			(l) => l.setupRequest?.status !== "PENDING",
		),
		skipped: pending.filter((l) => l.setupRequest?.status === "PENDING"),
		recovered: lines.uninstalledItems.filter((i) => i.status === "PENDING"),
	};
}

/**
 * Approve a task's pending lines inside the caller's transaction: each
 * installation consumes the worker's stock and logs its INSTALLATION_COST
 * cash entry (same as approving it on the Installations page), each recovered
 * item enters the worker's stock at the item's sellPrice. Any throw (stock
 * shortfall, missing stock item, a line claimed concurrently) rolls back the
 * whole transaction — including the caller's task status change.
 *
 * Add-on prices are iRadius-mirrored: the caller pushes them remote-first
 * (`pushAddonPricesToIRadius`) before opening the transaction.
 */
export async function approveTaskLinesInTx(
	tx: Prisma.TransactionClient,
	lines: {
		installations: TaskInstallationLine[];
		recovered: TaskRecoveredLine[];
	},
	userId: string,
): Promise<{ installations: number; recovered: number }> {
	for (const line of lines.installations) {
		await approveInstallationInTx(tx, line, userId, {
			createCashEntry: true,
		});
	}
	for (const item of lines.recovered) {
		await approveUninstalledItemInTx(tx, item, { userId });
	}
	return {
		installations: lines.installations.length,
		recovered: lines.recovered.length,
	};
}

/**
 * Undo a task submission's lines inside the caller's transaction, for a
 * rejected completion: pending lines are denied; approved installations give
 * the stock back to the worker, drop their cash entry and become DENIED;
 * approved recovered items leave the worker's stock again (unless
 * `keepRecovered`). Lines of a setup request are left alone — the setup
 * bundle owns them.
 *
 * Approved add-on lines are denied too, but the customer's IPTV / Real IP
 * price they set stays (no reliable previous value to restore); they are
 * returned so the admin can fix the price on the customer page.
 */
export async function revertTaskLinesInTx(
	tx: Prisma.TransactionClient,
	taskId: string,
	lines: {
		installations: TaskInstallationLine[];
		uninstalledItems: TaskRecoveredLine[];
	},
	userId: string,
	options: { keepRecovered: boolean },
): Promise<{ addonPriceKept: Array<{ note: string | null; price: number }> }> {
	const now = new Date();
	await tx.installation.updateMany({
		where: { taskId, status: "PENDING" },
		data: { status: "DENIED", approvedById: userId, approvedAt: now },
	});
	await tx.uninstalledItem.updateMany({
		where: { taskId, status: "PENDING" },
		data: { status: "DENIED", reviewedById: userId, reviewedAt: now },
	});

	const addonPriceKept: Array<{ note: string | null; price: number }> = [];
	for (const line of lines.installations) {
		if (line.status !== "APPROVED" || line.setupRequestId) {
			continue;
		}
		await revertApprovedInstallation(tx, line.id, userId, {
			deleteCashEntry: true,
			finalStatus: "DENIED",
			reason: "task completion rejected",
		});
		if (line.isAddOn) {
			addonPriceKept.push({ note: line.notes, price: line.price });
		}
	}
	if (!options.keepRecovered) {
		for (const item of lines.uninstalledItems) {
			if (item.status === "APPROVED") {
				await revertApprovedUninstalledItem(tx, item.id, userId);
			}
		}
	}
	return { addonPriceKept };
}
