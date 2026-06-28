"use client";

import { Button } from "@ui/components/button";
import { PhoneInput } from "@ui/components/phone-input";
import { PlusIcon, XIcon } from "lucide-react";

export const MAX_PHONES = 5;

export interface PhoneRow {
	id: string;
	number: string;
	primary: boolean;
}

/**
 * Controlled add/remove list of phone numbers (max 5, exactly one primary).
 * Used by the worker new-customer form and the admin edit-before-approval
 * dialog. Caller owns the array; this only renders + mutates via `onChange`.
 */
export function PhoneRows({
	phones,
	onChange,
}: {
	phones: PhoneRow[];
	onChange: (next: PhoneRow[]) => void;
}) {
	return (
		<div className="space-y-2">
			{phones.map((phone, index) => (
				<div key={phone.id} className="flex items-center gap-1.5">
					<PhoneInput
						value={phone.number}
						onChange={(val) =>
							onChange(
								phones.map((p, i) =>
									i === index ? { ...p, number: val } : p,
								),
							)
						}
						placeholder={
							phone.primary ? "Primary number" : "Other number"
						}
						className="min-w-0 flex-1"
					/>
					{phones.length > 1 && (
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-9 shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
							onClick={() => {
								const next = phones.filter(
									(_, i) => i !== index,
								);
								const first = next[0];
								if (phone.primary && first) {
									next[0] = { ...first, primary: true };
								}
								onChange(next);
							}}
						>
							<XIcon className="size-4" />
						</Button>
					)}
				</div>
			))}
			{phones.length < MAX_PHONES && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 text-xs"
					onClick={() =>
						onChange([
							...phones,
							{
								// react-doctor-disable-next-line react-doctor/rendering-hydration-mismatch-time -- crypto.randomUUID() runs inside the onClick handler, not during render; no hydration mismatch
								id: crypto.randomUUID(),
								number: "",
								primary: false,
							},
						])
					}
				>
					<PlusIcon className="mr-1 size-3.5" />
					Add phone
				</Button>
			)}
		</div>
	);
}
