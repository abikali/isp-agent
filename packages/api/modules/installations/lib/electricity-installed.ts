import { db } from "@repo/database";
import { iradiusSetApElectricalOnMany } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";

/**
 * Marking a stock item as an electricity item also covers the customers who
 * already have it: every customer with an approved installation of one of
 * `stockItemIds` that was not uninstalled since gets AP Electrical, iRadius
 * first and then locally. Installation approval only handles installs approved
 * after the item was marked (`pushApElectricalToIRadius`).
 *
 * Customers who already have the flag are left alone, and the flag is never
 * cleared here. Returns how many customers were set.
 */
export async function applyElectricityToInstalledCustomers(opts: {
	organizationId: string;
	stockItemIds: string[];
	iradiusDisabled: boolean;
}): Promise<number> {
	if (opts.stockItemIds.length === 0) {
		return 0;
	}
	const installs = await db.installation.findMany({
		where: {
			organizationId: opts.organizationId,
			stockItemId: { in: opts.stockItemIds },
			status: "APPROVED",
			isAddOn: false,
			customer: { deletedAt: null, apElectrical: false },
		},
		select: {
			installedAt: true,
			customer: { select: { id: true, externalId: true } },
		},
	});
	const lastInstall = new Map<
		string,
		{ externalId: string | null; installedAt: Date }
	>();
	for (const { customer, installedAt } of installs) {
		if (!customer) {
			continue;
		}
		const known = lastInstall.get(customer.id);
		if (!known || installedAt > known.installedAt) {
			lastInstall.set(customer.id, {
				externalId: customer.externalId,
				installedAt,
			});
		}
	}
	if (lastInstall.size === 0) {
		return 0;
	}

	// Uninstalls are recorded against the task, by item id or (legacy) name.
	const items = await db.stockItem.findMany({
		where: { id: { in: opts.stockItemIds } },
		select: { name: true },
	});
	const uninstalls = await db.uninstalledItem.findMany({
		where: {
			organizationId: opts.organizationId,
			status: { not: "DENIED" },
			task: { customerId: { in: [...lastInstall.keys()] } },
			OR: [
				{ stockItemId: { in: opts.stockItemIds } },
				{ itemName: { in: items.map((item) => item.name) } },
			],
		},
		select: { uninstalledAt: true, task: { select: { customerId: true } } },
	});
	for (const { task, uninstalledAt } of uninstalls) {
		const customerId = task?.customerId;
		const install = customerId ? lastInstall.get(customerId) : undefined;
		if (customerId && install && uninstalledAt > install.installedAt) {
			lastInstall.delete(customerId);
		}
	}

	const linked = new Map<string, string>();
	const localOnly: string[] = [];
	for (const [customerId, { externalId }] of lastInstall) {
		if (externalId && !opts.iradiusDisabled) {
			linked.set(externalId, customerId);
		} else {
			localOnly.push(customerId);
		}
	}

	let confirmed: string[] = [];
	return mirrorToIRadius({
		iradiusDisabled: linked.size === 0,
		logTag: "iRadius set AP electrical for installed customers",
		failureMessage:
			"Failed to set AP Electrical in iRadius for the customers who already have this item — nothing was changed",
		remote: async () => {
			confirmed = await iradiusSetApElectricalOnMany([...linked.keys()]);
		},
		local: async () => {
			const customerIds = [
				...localOnly,
				...confirmed.flatMap((externalId) => {
					const customerId = linked.get(externalId);
					return customerId ? [customerId] : [];
				}),
			];
			if (customerIds.length === 0) {
				return 0;
			}
			const { count } = await db.customer.updateMany({
				where: { id: { in: customerIds }, apElectrical: false },
				data: { apElectrical: true },
			});
			return count;
		},
	});
}
