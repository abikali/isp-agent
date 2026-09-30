import { db } from "@repo/database";
import { iradiusSetApElectrical } from "../../customers/lib/iradius-api";

/**
 * Remote side of approving installation lines: when any installed stock item
 * is an electricity item (`StockItem.isElectricity` — the customer now powers
 * our access point), set `UserNas.APElectrical = 1` in iRadius for a linked
 * customer. Call it in the `remote` step, before the approval transaction —
 * `approveInstallationInTx` sets `Customer.apElectrical` locally.
 *
 * Unlinked customers and lines without an electricity item make no call.
 * Never clears the flag: an uninstall or a revert leaves it for an admin to
 * turn off from the customer page.
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
