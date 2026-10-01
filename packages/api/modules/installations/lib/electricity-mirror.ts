import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { iradiusSetApElectrical } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";

/**
 * Remote side of approving installation lines: when any installed stock item
 * is an electricity item (`StockItem.isElectricity` — the customer now powers
 * our access point), set `UserNas.APElectrical = 1` in iRadius for a linked
 * customer. Call it in the `remote` step, before the approval transaction —
 * `approveInstallationInTx` sets `Customer.apElectrical` locally.
 *
 * Unlinked customers and lines without an electricity item make no call.
 * Never clears the flag: a revert leaves it for an admin to turn off from the
 * customer page. An approved uninstall clears it —
 * `clearApElectricalAfterUninstall`.
 */
export async function pushApElectricalToIRadius(
	customer: { externalId: string | null } | null,
	lines: ReadonlyArray<{ stockItemId: string | null; isAddOn: boolean }>,
): Promise<void> {
	if (!customer?.externalId) {
		return;
	}
	const stockItemIds = lines.flatMap((line) =>
		!line.isAddOn && line.stockItemId ? [line.stockItemId] : [],
	);
	if (stockItemIds.length === 0) {
		return;
	}
	const electricity = await db.stockItem.findFirst({
		where: { id: { in: stockItemIds }, isElectricity: true },
		select: { id: true },
	});
	if (!electricity) {
		return;
	}
	const { affectedRows } = await iradiusSetApElectrical(customer, true);
	if (affectedRows !== 1) {
		throw new Error(
			`iRadius AP Electrical update touched ${affectedRows} rows (expected 1)`,
		);
	}
}

/** Whether the customer still has an electricity item installed. */
async function hasElectricityItemInstalled(
	organizationId: string,
	customerId: string,
): Promise<boolean> {
	const [installs, uninstalls] = await Promise.all([
		db.installation.findMany({
			where: {
				organizationId,
				customerId,
				status: "APPROVED",
				isAddOn: false,
				stockItem: { isElectricity: true },
			},
			select: { stockItemId: true, installedAt: true, taskId: true },
		}),
		db.uninstalledItem.findMany({
			where: {
				organizationId,
				status: "APPROVED",
				task: { customerId },
				stockItem: { isElectricity: true },
			},
			select: { stockItemId: true, uninstalledAt: true, taskId: true },
		}),
	]);
	// An install is still in place unless the same item was recovered later,
	// in another task — one task that recovers and installs the same item is a
	// replacement, and the new unit stays.
	return installs.some(
		(install) =>
			!uninstalls.some(
				(uninstall) =>
					uninstall.stockItemId === install.stockItemId &&
					uninstall.uninstalledAt > install.installedAt &&
					uninstall.taskId !== install.taskId,
			),
	);
}

/**
 * After recovered items were approved: when one of them is an electricity
 * item and the customer has none left installed, turn AP Electrical off —
 * iRadius first, then locally. Call it once the approval has committed.
 *
 * Never throws: the recovery is already approved, and a failed push changes
 * neither side, so the flag just stays on for an admin to turn off from the
 * customer page.
 */
export async function clearApElectricalAfterUninstall(opts: {
	organizationId: string;
	uninstalledItemIds: string[];
	iradiusDisabled: boolean;
}): Promise<void> {
	if (opts.uninstalledItemIds.length === 0) {
		return;
	}
	try {
		const customers = await db.customer.findMany({
			where: {
				organizationId: opts.organizationId,
				deletedAt: null,
				apElectrical: true,
				tasks: {
					some: {
						uninstalledItems: {
							some: {
								id: { in: opts.uninstalledItemIds },
								status: "APPROVED",
								stockItem: { isElectricity: true },
							},
						},
					},
				},
			},
			select: { id: true, externalId: true },
		});
		for (const customer of customers) {
			if (
				await hasElectricityItemInstalled(
					opts.organizationId,
					customer.id,
				)
			) {
				continue;
			}
			await mirrorToIRadius({
				iradiusDisabled: opts.iradiusDisabled || !customer.externalId,
				logTag: "iRadius clear AP electrical after uninstall",
				failureMessage: "Failed to clear AP Electrical in iRadius",
				remote: async () => {
					const { affectedRows } = await iradiusSetApElectrical(
						customer,
						false,
					);
					if (affectedRows !== 1) {
						throw new Error(
							`iRadius AP Electrical update touched ${affectedRows} rows (expected 1)`,
						);
					}
				},
				local: () =>
					db.customer.update({
						where: { id: customer.id },
						data: { apElectrical: false },
						select: { id: true },
					}),
			});
		}
	} catch (error) {
		logger.warn("[AP Electrical] clear after uninstall failed", {
			uninstalledItemIds: opts.uninstalledItemIds,
			error: String(error),
		});
	}
}
