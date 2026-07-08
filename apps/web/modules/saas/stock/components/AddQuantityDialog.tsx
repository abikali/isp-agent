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
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { cn } from "@ui/lib";
import { useState } from "react";
import { toast } from "sonner";
import { useAddStockQuantity } from "../hooks/use-stock";
import { QuantityInput } from "./QuantityInput";
import type { StockItem } from "./StockList";

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
						<Input
							id="adjust-qty-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Optional note"
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
			</DialogContent>
		</Dialog>
	);
}
