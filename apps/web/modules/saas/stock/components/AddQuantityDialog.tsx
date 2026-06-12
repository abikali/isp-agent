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
import { useState } from "react";
import { toast } from "sonner";
import { useAddStockQuantity } from "../hooks/use-stock";
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
	const [quantity, setQuantity] = useState(1);
	const [notes, setNotes] = useState("");

	async function handleSubmit() {
		if (!organizationId || quantity === 0) {
			return;
		}
		try {
			await addQuantity.mutateAsync({
				organizationId,
				id: item.id,
				quantity,
				notes: notes || undefined,
			});
			toast.success(
				quantity > 0
					? `Added ${quantity} to ${item.name}`
					: `Adjusted ${item.name} by ${quantity}`,
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
					<DialogTitle>Add Quantity — {item.name}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Currently in stock:{" "}
						<span className="font-mono font-medium text-foreground">
							{item.quantity}
						</span>
					</p>
					<div className="space-y-1.5">
						<Label htmlFor="add-qty">Quantity</Label>
						<Input
							id="add-qty"
							type="number"
							value={quantity}
							onChange={(e) =>
								setQuantity(Number(e.target.value))
							}
						/>
						<p className="text-xs text-muted-foreground">
							Use a negative number to correct stock downwards.
						</p>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="add-qty-notes">Notes</Label>
						<Input
							id="add-qty-notes"
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
						onClick={handleSubmit}
						disabled={addQuantity.isPending || quantity === 0}
					>
						{addQuantity.isPending ? "Saving..." : "Update stock"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
