import { getPrimaryPhone } from "@repo/database/phones";

export interface MirrorExistingFields {
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	address: string | null;
	mobile: string | null;
	phone: string | null;
	groupExternalId: number | null;
	collectorId: string | null;
	latitude: number | null;
	longitude: number | null;
	notes: string | null;
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
	labels: string[];
	submittedPrimary: string | null;
	submittedSecondary: string | null;
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

	let submittedPrimary: string | null = null;
	let submittedSecondary: string | null = null;
	let phonesChanged = false;
	if (next.phones !== undefined) {
		submittedPrimary = normalizeString(getPrimaryPhone(next.phones));
		submittedSecondary = normalizeString(
			next.phones.find((p) => !p.primary)?.number ?? null,
		);
		phonesChanged =
			submittedPrimary !== normalizeString(existing.mobile) ||
			submittedSecondary !== normalizeString(existing.phone);
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

	return {
		nameChanged,
		emailChanged,
		addressChanged,
		phonesChanged,
		groupChanged,
		collectorChanged,
		locationChanged,
		notesChanged,
		labels,
		submittedPrimary,
		submittedSecondary,
	};
}
