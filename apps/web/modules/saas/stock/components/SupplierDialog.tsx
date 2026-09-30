"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateSupplier, useUpdateSupplier } from "../hooks/use-stock";
import {
	EMPTY_SUPPLIER_FORM,
	SupplierFormFields,
	supplierFormPayload,
	supplierToForm,
} from "./SupplierFormFields";

interface EditableSupplier {
	id: string;
	name: string;
	phones: unknown;
	notes: string | null;
}

/**
 * Create a supplier (no `supplier`) or edit one. Render only while open so
 * the form starts from the supplier it was opened for.
 */
export function SupplierDialog({
	supplier,
	onClose,
	onSaved,
}: {
	supplier?: EditableSupplier | null;
	onClose: () => void;
	onSaved?: (supplier: { id: string; name: string }) => void;
}) {
	const organizationId = useOrganizationId();
	const createSupplier = useCreateSupplier();
	const updateSupplier = useUpdateSupplier();
	const [value, setValue] = useState(
		supplier ? supplierToForm(supplier) : EMPTY_SUPPLIER_FORM,
	);
	const pending = createSupplier.isPending || updateSupplier.isPending;

	async function handleSave() {
		if (!organizationId || !value.name.trim()) {
			return;
		}
		const payload = supplierFormPayload(value);
		try {
			const result = supplier
				? await updateSupplier.mutateAsync({
						organizationId,
						id: supplier.id,
						...payload,
						notes: payload.notes || null,
					})
				: await createSupplier.mutateAsync({
						organizationId,
						...payload,
						notes: payload.notes || undefined,
					});
			toast.success(
				supplier
					? `Supplier "${result.supplier.name}" updated`
					: `Supplier "${result.supplier.name}" added`,
			);
			onSaved?.(result.supplier);
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to save supplier",
			);
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{supplier ? `Edit ${supplier.name}` : "New supplier"}
					</DialogTitle>
				</DialogHeader>
				<SupplierFormFields value={value} onChange={setValue} />
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={pending || !value.name.trim()}
					>
						{pending ? "Saving…" : "Save supplier"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
