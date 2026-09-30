"use client";

import { type PhoneRow, PhoneRows } from "@shared/components/PhoneRows";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Textarea } from "@ui/components/textarea";

export interface SupplierFormValue {
	name: string;
	phones: PhoneRow[];
	notes: string;
}

export const EMPTY_SUPPLIER_FORM: SupplierFormValue = {
	name: "",
	phones: [],
	notes: "",
};

/** A saved supplier (phones are `[{ number, primary }]` JSON) → form state. */
export function supplierToForm(supplier: {
	name: string;
	phones: unknown;
	notes: string | null;
}): SupplierFormValue {
	const phones = Array.isArray(supplier.phones)
		? (supplier.phones as Array<{ number?: unknown; primary?: unknown }>)
		: [];
	return {
		name: supplier.name,
		phones: phones
			.filter((p) => typeof p.number === "string")
			.map((p, i) => ({
				id: `phone-${i}`,
				number: String(p.number),
				primary: p.primary === true,
			})),
		notes: supplier.notes ?? "",
	};
}

/** Form state → create / update payload. The first number is primary. */
export function supplierFormPayload(value: SupplierFormValue) {
	return {
		name: value.name.trim(),
		phones: value.phones
			.filter((p) => p.number.trim())
			.map((p, i) => ({ number: p.number.trim(), primary: i === 0 })),
		notes: value.notes.trim(),
	};
}

/** Name + phone numbers + notes — shared by every supplier form. */
export function SupplierFormFields({
	value,
	onChange,
	idPrefix = "supplier",
}: {
	value: SupplierFormValue;
	onChange: (next: SupplierFormValue) => void;
	idPrefix?: string;
}) {
	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-name`}>Name</Label>
				<Input
					id={`${idPrefix}-name`}
					value={value.name}
					onChange={(e) =>
						onChange({ ...value, name: e.target.value })
					}
					placeholder="e.g. Ali Electronics"
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Phone numbers</Label>
				<PhoneRows
					phones={value.phones}
					onChange={(phones) => onChange({ ...value, phones })}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
				<Textarea
					id={`${idPrefix}-notes`}
					value={value.notes}
					onChange={(e) =>
						onChange({ ...value, notes: e.target.value })
					}
					placeholder="What they sell, payment terms…"
					rows={2}
					maxLength={2000}
				/>
			</div>
		</div>
	);
}
