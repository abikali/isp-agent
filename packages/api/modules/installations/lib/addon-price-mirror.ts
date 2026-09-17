import {
	diffMirrorFields,
	pushMirrorDiffToIRadius,
} from "../../customers/lib/mirror-fields";
import { addonPriceFields } from "./addons";

/**
 * Remote side of an add-on approval: push the IPTV / Real IP price the lines
 * set to iRadius (UserNas.IPTVPRICE / REALIPPRICE) for a linked customer.
 * Call it as the `remote` step of `mirrorToIRadius`, whose `local` step runs
 * the approval transaction (`approveInstallationInTx` writes the same prices
 * locally). Unlinked customers and lines without an add-on make no call.
 *
 * Always pushes the approved price rather than diffing against the local
 * column: approval asserts the price, and the local value is only a synced
 * copy that may already disagree with iRadius (an unresolved sync conflict,
 * or a setup-request price edited before the subscriber was created).
 */
export async function pushAddonPricesToIRadius(
	customer: {
		externalId: string | null;
		firstName: string | null;
		lastName: string | null;
	} | null,
	lines: ReadonlyArray<{
		isAddOn: boolean;
		notes: string | null;
		price: number;
	}>,
): Promise<void> {
	if (!customer?.externalId) {
		return;
	}
	const next = addonPriceFields(lines);
	const diff = diffMirrorFields(
		{
			firstName: customer.firstName,
			lastName: customer.lastName,
			email: null,
			address: null,
			phones: null,
			groupExternalId: null,
			collectorId: null,
			latitude: null,
			longitude: null,
			notes: null,
			iptvPrice: null,
			realIpPrice: null,
		},
		next,
	);
	if (!diff.iptvPriceChanged && !diff.realIpPriceChanged) {
		return;
	}
	await pushMirrorDiffToIRadius({
		externalId: customer.externalId,
		diff,
		next,
		existing: customer,
	});
}
