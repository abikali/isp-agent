import type { Prisma } from "@repo/database";
import { type AddonType, classifyAddonNote } from "./addons";

/**
 * A pending setup request stores each add-on price twice: on the customer
 * (`iptvPrice` / `realIpPrice`, pushed to iRadius when the request is
 * approved) and on its PENDING add-on install line (written back onto the
 * customer by `approveInstallationInTx` in the same approval). If the two
 * disagree, iRadius gets one price and the local customer ends up with the
 * other. These helpers keep them in step whichever side is edited.
 */

/** Customer-side edit → set the request's pending add-on line prices. */
export async function syncPendingAddonLinePrices(
	tx: Prisma.TransactionClient,
	setupRequestId: string,
	prices: Partial<Record<AddonType, number | undefined>>,
): Promise<void> {
	if (prices.IPTV === undefined && prices.REAL_IP === undefined) {
		return;
	}
	const lines = await tx.installation.findMany({
		where: { setupRequestId, status: "PENDING", isAddOn: true },
		select: { id: true, notes: true },
	});
	for (const line of lines) {
		const type = classifyAddonNote(line.notes);
		const price = type ? prices[type] : undefined;
		if (price !== undefined) {
			await tx.installation.update({
				where: { id: line.id },
				data: { price },
			});
		}
	}
}

/**
 * Line-side edit → set the customer's add-on price, but only while the line
 * belongs to a still-pending setup request (an unlinked, pending customer).
 */
export async function syncCustomerAddonPrice(
	tx: Prisma.TransactionClient,
	installation: { setupRequestId: string | null; notes: string | null },
	price: number,
): Promise<void> {
	const type = classifyAddonNote(installation.notes);
	if (!type || !installation.setupRequestId) {
		return;
	}
	const request = await tx.customerSetupRequest.findFirst({
		where: { id: installation.setupRequestId, status: "PENDING" },
		select: { customerId: true },
	});
	if (!request) {
		return;
	}
	await tx.customer.update({
		where: { id: request.customerId },
		data: type === "IPTV" ? { iptvPrice: price } : { realIpPrice: price },
	});
}
