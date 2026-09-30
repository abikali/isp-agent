"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Label } from "@ui/components/label";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAddStockQuantity, useSuppliersQuery } from "../hooks/use-stock";
import { QuantityInput } from "./QuantityInput";
import type { StockItem } from "./StockList";
import { SupplierDialog } from "./SupplierDialog";

export function AddQuantityDialog({
	open,
	onOpenChange,
	item,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: StockItem;
}) {
	const organizationId = useOrganizationId();
	const addQuantity = useAddStockQuantity();
	// Mobile number keyboards have no minus key, so the sign is a UI toggle
	// instead of asking the user to type a negative number.
	const [mode, setMode] = useState<"add" | "remove">("add");
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");
	const { suppliers } = useSuppliersQuery();
	const [creatingSupplier, setCreatingSupplier] = useState(false);
	// Default to whoever delivered this item last, else its only supplier.
	const [supplierId, setSupplierId] = useState(
		item.lastDelivery?.supplierId ??
			(item.suppliers.length === 1 ? (item.suppliers[0]?.id ?? "") : ""),
	);
	const supplierOptions = [
		{ value: "", label: "No supplier" },
		...suppliers.map((s) => ({ value: s.id, label: s.name })),
	];

	const isRemove = mode === "remove";
	const newQuantity = isRemove
		? item.quantity - quantity
		: item.quantity + quantity;
	// Warehouse stock can't go negative (server rejects it too).
	const maxQty = isRemove ? item.quantity : undefined;
	const invalid = quantity < 1 || (isRemove && quantity > item.quantity);

	async function handleSubmit() {
		if (!organizationId || invalid) {
			return;
		}
		try {
			await addQuantity.mutateAsync({
				organizationId,
				id: item.id,
				quantity: isRemove ? -quantity : quantity,
				notes: notes || undefined,
				supplierId: !isRemove && supplierId ? supplierId : undefined,
			});
			toast.success(
				isRemove
					? `Removed ${quantity} from ${item.name}`
					: `Added ${quantity} to ${item.name}`,
			);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update quantity",
			);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Adjust Stock — {item.name}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<Tabs
						value={mode}
						onValueChange={(v) => {
							setMode(v as "add" | "remove");
							setQuantity(1);
						}}
					>
						<TabsList className="w-full">
							<TabsTrigger value="add" className="flex-1">
								Add
							</TabsTrigger>
							<TabsTrigger
								value="remove"
								className="flex-1"
								disabled={item.quantity <= 0}
							>
								Remove
							</TabsTrigger>
						</TabsList>
					</Tabs>
					{!isRemove && (
						<div className="space-y-1.5">
							<Label htmlFor="adjust-qty-supplier">
								Supplier (who delivered it)
							</Label>
							<div className="flex gap-2">
								<Combobox
									id="adjust-qty-supplier"
									options={supplierOptions}
									value={supplierId}
									onChange={setSupplierId}
									placeholder="No supplier"
									searchPlaceholder="Search suppliers…"
									emptyText="No suppliers yet"
									className="min-w-0 flex-1"
								/>
								<Button
									type="button"
									variant="outline"
									size="icon"
									aria-label="New supplier"
									onClick={() => setCreatingSupplier(true)}
								>
									<PlusIcon className="size-4" />
								</Button>
							</div>
							{!supplierId && (
								<p className="text-muted-foreground text-xs">
									Recording the supplier shows where each
									delivery came from in the stock log.
								</p>
							)}
						</div>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="adjust-qty">Quantity</Label>
						<QuantityInput
							id="adjust-qty"
							value={quantity}
							onChange={setQuantity}
							min={1}
							max={maxQty}
						/>
					</div>
					<p className="text-sm text-muted-foreground">
						In stock:{" "}
						<span className="font-mono font-medium text-foreground">
							{item.quantity}
						</span>{" "}
						→{" "}
						<span
							className={cn(
								"font-mono font-medium",
								newQuantity < 0
									? "text-destructive"
									: "text-foreground",
							)}
						>
							{newQuantity}
						</span>
					</p>
					<div className="space-y-1.5">
						<Label htmlFor="adjust-qty-notes">Notes</Label>
						<Textarea
							id="adjust-qty-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder={
								isRemove
									? "Why is stock being removed?"
									: "Invoice #, price paid, remarks"
							}
							rows={2}
							maxLength={1000}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						variant={isRemove ? "destructive" : "primary"}
						onClick={handleSubmit}
						disabled={addQuantity.isPending || invalid}
					>
						{addQuantity.isPending
							? "Saving..."
							: isRemove
								? `Remove ${quantity}`
								: `Add ${quantity}`}
					</Button>
				</DialogFooter>
				{creatingSupplier && (
					<SupplierDialog
						onClose={() => setCreatingSupplier(false)}
						onSaved={(supplier) => setSupplierId(supplier.id)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
