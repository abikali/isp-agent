import { buildIRadiusMobile } from "@repo/database/phones";
import {
	iradiusChangeCollector,
	iradiusSetDeductMoney,
	iradiusSetIptvPrice,
	iradiusSetRealIpPrice,
	iradiusSetRecurringDiscount,
	iradiusUpdateUserAddress,
	iradiusUpdateUserComment,
	iradiusUpdateUserEmail,
	iradiusUpdateUserGroup,
	iradiusUpdateUserLocation,
	iradiusUpdateUserName,
	iradiusUpdateUserPhones,
} from "./iradius-api";

export interface MirrorExistingFields {
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	address: string | null;
	phones: unknown;
	groupExternalId: number | null;
	collectorId: string | null;
	latitude: number | null;
	longitude: number | null;
	notes: string | null;
	// Billing extras. Optional so callers with a narrower select (e.g. the
	// collector payment sheet, which never mirrors these) still type-check.
	discount?: number | null;
	iptvPrice?: number | null;
	realIpPrice?: number | null;
	deductMoney?: number | null;
}

export interface MirrorNextFields {
	firstName?: string | null | undefined;
	lastName?: string | null | undefined;
	email?: string | null | undefined;
	address?: string | null | undefined;
	phones?: ReadonlyArray<{ number: string; primary: boolean }> | undefined;
	groupExternalId?: number | null | undefined;
	collectorId?: string | null | undefined;
	latitude?: number | null | undefined;
	longitude?: number | null | undefined;
	notes?: string | null | undefined;
	discount?: number | null | undefined;
	iptvPrice?: number | null | undefined;
	realIpPrice?: number | null | undefined;
	deductMoney?: number | null | undefined;
}

export interface MirrorDiff {
	nameChanged: boolean;
	emailChanged: boolean;
	addressChanged: boolean;
	phonesChanged: boolean;
	groupChanged: boolean;
	collectorChanged: boolean;
	locationChanged: boolean;
	notesChanged: boolean;
	discountChanged: boolean;
	iptvPriceChanged: boolean;
	realIpPriceChanged: boolean;
	deductMoneyChanged: boolean;
	labels: string[];
	submittedMobile: string | null;
}

function normalizeString(value: string | null | undefined): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

export function diffMirrorFields(
	existing: MirrorExistingFields,
	next: MirrorNextFields,
): MirrorDiff {
	const nameChanged =
		(next.firstName !== undefined &&
			normalizeString(next.firstName) !==
				normalizeString(existing.firstName)) ||
		(next.lastName !== undefined &&
			normalizeString(next.lastName) !==
				normalizeString(existing.lastName));

	const emailChanged =
		next.email !== undefined &&
		normalizeString(next.email) !== normalizeString(existing.email);

	const addressChanged =
		next.address !== undefined &&
		normalizeString(next.address) !== normalizeString(existing.address);

	let submittedMobile: string | null = null;
	let phonesChanged = false;
	if (next.phones !== undefined) {
		submittedMobile = buildIRadiusMobile(next.phones);
		phonesChanged = submittedMobile !== buildIRadiusMobile(existing.phones);
	}

	const groupChanged =
		next.groupExternalId !== undefined &&
		(next.groupExternalId ?? null) !== (existing.groupExternalId ?? null);

	const collectorChanged =
		next.collectorId !== undefined &&
		(next.collectorId || null) !== (existing.collectorId || null);

	// Coordinate comparison uses an epsilon to avoid false positives from
	// double-precision rendering differences — same rule as sync `valuesEqual`.
	const FLOAT_EPSILON = 1e-6;
	const floatChanged = (a: number | null, b: number | null): boolean => {
		if (a == null && b == null) {
			return false;
		}
		if (a == null || b == null) {
			return true;
		}
		return Math.abs(a - b) >= FLOAT_EPSILON;
	};

	const locationChanged =
		(next.latitude !== undefined &&
			floatChanged(next.latitude ?? null, existing.latitude ?? null)) ||
		(next.longitude !== undefined &&
			floatChanged(next.longitude ?? null, existing.longitude ?? null));

	const notesChanged =
		next.notes !== undefined &&
		normalizeString(next.notes) !== normalizeString(existing.notes);

	const discountChanged =
		next.discount !== undefined &&
		floatChanged(next.discount ?? null, existing.discount ?? null);

	const iptvPriceChanged =
		next.iptvPrice !== undefined &&
		floatChanged(next.iptvPrice ?? null, existing.iptvPrice ?? null);

	const realIpPriceChanged =
		next.realIpPrice !== undefined &&
		floatChanged(next.realIpPrice ?? null, existing.realIpPrice ?? null);

	const deductMoneyChanged =
		next.deductMoney !== undefined &&
		floatChanged(next.deductMoney ?? null, existing.deductMoney ?? null);

	const labels: string[] = [];
	if (nameChanged) {
		labels.push("Name");
	}
	if (emailChanged) {
		labels.push("Email");
	}
	if (addressChanged) {
		labels.push("Address");
	}
	if (phonesChanged) {
		labels.push("Phone numbers");
	}
	if (groupChanged) {
		labels.push("Group");
	}
	if (collectorChanged) {
		labels.push("Collector");
	}
	if (locationChanged) {
		labels.push("Location");
	}
	if (notesChanged) {
		labels.push("Notes");
	}
	if (discountChanged) {
		labels.push("Discount");
	}
	if (iptvPriceChanged) {
		labels.push("IPTV price");
	}
	if (realIpPriceChanged) {
		labels.push("Real IP price");
	}
	if (deductMoneyChanged) {
		labels.push("Deduct money");
	}

	return {
		nameChanged,
		emailChanged,
		addressChanged,
		phonesChanged,
		groupChanged,
		collectorChanged,
		locationChanged,
		notesChanged,
		discountChanged,
		iptvPriceChanged,
		realIpPriceChanged,
		deductMoneyChanged,
		labels,
		submittedMobile,
	};
}

/**
 * Run the iRadius writes implied by a computed `MirrorDiff`. This is the single
 * definition of "what mirroring a customer field change means" — every write
 * path (customer edit, collector payment sheet, …) calls this so they all push
 * the same fields the same way.
 *
 * Remote side only: invoke it from inside a `mirrorToIRadius({ remote })`
 * closure (or before opening a local transaction) so the local DB write runs
 * *after* every push here has succeeded. On any iRadius failure this throws and
 * the caller must skip its local write — that is the no-drift guarantee.
 *
 * `null`/empty `next` values clear the corresponding iRadius column, so this
 * mirrors clears as faithfully as it mirrors edits.
 */
export async function pushMirrorDiffToIRadius(opts: {
	externalId: string;
	diff: MirrorDiff;
	next: MirrorNextFields;
	existing: Pick<MirrorExistingFields, "firstName" | "lastName">;
	collectorIRadiusUserId?: number | null;
}): Promise<void> {
	const { externalId, diff, next, existing } = opts;
	const stub = { externalId };

	if (diff.collectorChanged) {
		await iradiusChangeCollector(stub, opts.collectorIRadiusUserId ?? null);
	}
	if (diff.nameChanged) {
		const firstName = next.firstName ?? existing.firstName ?? "";
		const lastName =
			next.lastName !== undefined
				? (next.lastName ?? "")
				: (existing.lastName ?? "");
		await iradiusUpdateUserName(stub, firstName, lastName);
	}
	if (diff.emailChanged) {
		await iradiusUpdateUserEmail(stub, next.email || null);
	}
	if (diff.addressChanged) {
		await iradiusUpdateUserAddress(stub, next.address || null);
	}
	if (diff.phonesChanged) {
		await iradiusUpdateUserPhones(stub, diff.submittedMobile);
	}
	if (diff.groupChanged) {
		await iradiusUpdateUserGroup(stub, next.groupExternalId ?? null);
	}
	if (diff.locationChanged) {
		await iradiusUpdateUserLocation(
			stub,
			next.latitude ?? null,
			next.longitude ?? null,
		);
	}
	if (diff.notesChanged) {
		await iradiusUpdateUserComment(stub, next.notes || null);
	}
	if (diff.discountChanged) {
		await iradiusSetRecurringDiscount(stub, next.discount ?? 0);
	}
	if (diff.iptvPriceChanged) {
		await iradiusSetIptvPrice(stub, next.iptvPrice ?? 0);
	}
	if (diff.realIpPriceChanged) {
		await iradiusSetRealIpPrice(stub, next.realIpPrice ?? 0);
	}
	if (diff.deductMoneyChanged) {
		await iradiusSetDeductMoney(stub, next.deductMoney ?? null);
	}
}
