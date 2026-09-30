"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Label } from "@ui/components/label";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateSupplier, useSuppliersQuery } from "../hooks/use-stock";
import {
	EMPTY_SUPPLIER_FORM,
	SupplierFormFields,
	supplierFormPayload,
} from "./SupplierFormFields";

/**
 * Multi-select of the org's suppliers with an inline "new supplier" form, so
 * the admin never leaves the item dialog to record who they buy from.
 */
export function SupplierPicker({
	value,
	onChange,
}: {
	value: string[];
	onChange: (next: string[]) => void;
}) {
	const organizationId = useOrganizationId();
	const { suppliers } = useSuppliersQuery();
	const createSupplier = useCreateSupplier();
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState(EMPTY_SUPPLIER_FORM);

	function toggle(id: string) {
		onChange(
			value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
		);
	}

	async function handleCreate() {
		if (!organizationId || !form.name.trim()) {
			return;
		}
		const payload = supplierFormPayload(form);
		try {
			const { supplier } = await createSupplier.mutateAsync({
				organizationId,
				...payload,
				notes: payload.notes || undefined,
			});
			onChange([...value, supplier.id]);
			setForm(EMPTY_SUPPLIER_FORM);
			setAdding(false);
			toast.success(`Supplier "${supplier.name}" added`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to add supplier",
			);
		}
	}

	return (
		<div className="space-y-2">
			{suppliers.length > 0 && (
				<div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
					{suppliers.map((s) => {
						const id = `supplier-${s.id}`;
						return (
							<div key={s.id} className="flex items-center gap-2">
								<Checkbox
									id={id}
									checked={value.includes(s.id)}
									onCheckedChange={() => toggle(s.id)}
								/>
								<Label
									htmlFor={id}
									className="flex-1 font-normal"
								>
									{s.name}
									{s._count.items > 0 && (
										<span className="ml-1 text-xs text-muted-foreground">
											· {s._count.items}{" "}
											{s._count.items === 1
												? "item"
												: "items"}
										</span>
									)}
								</Label>
							</div>
						);
					})}
				</div>
			)}
			{adding ? (
				<div className="space-y-2 rounded-md border border-dashed p-3">
					<div className="flex items-center justify-between">
						<span className="font-medium text-sm">
							New supplier
						</span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() => setAdding(false)}
						>
							<XIcon className="size-4" />
						</Button>
					</div>
					<SupplierFormFields
						value={form}
						onChange={setForm}
						idPrefix="new-supplier"
					/>
					<Button
						type="button"
						size="sm"
						onClick={handleCreate}
						disabled={!form.name.trim() || createSupplier.isPending}
					>
						{createSupplier.isPending ? "Saving…" : "Save supplier"}
					</Button>
				</div>
			) : (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-7 text-xs"
					onClick={() => setAdding(true)}
				>
					<PlusIcon className="mr-1 size-3.5" />
					New supplier
				</Button>
			)}
			{value.length > 0 && suppliers.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{value.map((id) => {
						const s = suppliers.find((x) => x.id === id);
						return s ? (
							<Badge key={id} variant="secondary">
								{s.name}
							</Badge>
						) : null;
					})}
				</div>
			)}
		</div>
	);
}
