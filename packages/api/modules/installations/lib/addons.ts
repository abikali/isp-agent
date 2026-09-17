/**
 * Add-on installations (isAddOn=true) carry no stock item; the add-on name
 * lives in `notes` — same convention as the legacy billing import
 * (billing-sync.worker.ts addon_installations phase).
 */
export const ADDON_TYPES = [
	{ value: "IPTV", label: "IPTV" },
	{ value: "REAL_IP", label: "Real IP" },
] as const;

export type AddonType = (typeof ADDON_TYPES)[number]["value"];

export function addonNoteFor(type: AddonType): string {
	return type === "IPTV" ? "IPTV" : "Real IP";
}

/** Classify an installation's add-on kind from its stored note. */
export function classifyAddonNote(
	note: string | null | undefined,
): AddonType | null {
	if (!note) {
		return null;
	}
	const n = note.toLowerCase();
	if (n.includes("iptv")) {
		return "IPTV";
	}
	if (n.includes("real") && n.includes("ip")) {
		return "REAL_IP";
	}
	return null;
}

export interface AddonPriceFields {
	iptvPrice?: number;
	realIpPrice?: number;
}

/**
 * The customer's recurring add-on prices that approving these installation
 * lines sets: an IPTV line sets `iptvPrice`, a Real IP line `realIpPrice`.
 * Physical lines and unrecognised add-on notes contribute nothing.
 */
export function addonPriceFields(
	lines: ReadonlyArray<{
		isAddOn: boolean;
		notes: string | null;
		price: number;
	}>,
): AddonPriceFields {
	const fields: AddonPriceFields = {};
	for (const line of lines) {
		if (!line.isAddOn) {
			continue;
		}
		const type = classifyAddonNote(line.notes);
		if (type === "IPTV") {
			fields.iptvPrice = line.price;
		} else if (type === "REAL_IP") {
			fields.realIpPrice = line.price;
		}
	}
	return fields;
}
