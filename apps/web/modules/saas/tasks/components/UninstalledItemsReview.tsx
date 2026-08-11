"use client";

import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PermissionGate } from "@shared/components/PermissionGate";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Input } from "@ui/components/input";
import { CheckIcon, ImageIcon, PackageMinusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	usePendingUninstalledItems,
	useReviewUninstalledItem,
} from "../hooks/use-field-work";

type PendingItem = ReturnType<
	typeof usePendingUninstalledItems
>["items"][number];

/** Parse a price input; null for empty/invalid (empty = use the server default). */
function parsePriceInput(raw: string | undefined): number | null {
	if (raw === undefined || raw.trim() === "") {
		return null;
	}
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 ? value : null;
}

export function UninstalledItemsReview() {
	const organizationId = useOrganizationId();
	const { items, isLoading } = usePendingUninstalledItems();
	const review = useReviewUninstalledItem();
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
	const [nameEdits, setNameEdits] = useState<Record<string, string>>({});
	const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});

	if (isLoading || items.length === 0) {
		return null;
	}

	async function handleReview(item: PendingItem, action: "approve" | "deny") {
		if (!organizationId) {
			return;
		}
		let quantity: number | undefined;
		let unitPrice: number | undefined;
		if (action === "approve") {
			quantity = Number(qtyEdits[item.id] ?? item.quantity);
			if (!Number.isInteger(quantity) || quantity < 1) {
				toast.error("Quantity must be a whole number of 1 or more");
				return;
			}
			const rawPrice = priceEdits[item.id];
			if (rawPrice !== undefined && rawPrice.trim() !== "") {
				const parsed = parsePriceInput(rawPrice);
				if (parsed === null) {
					toast.error("Unit price must be 0 or more");
					return;
				}
				unitPrice = parsed;
			}
		}
		const editedName = nameEdits[item.id]?.trim();
		try {
			await review.mutateAsync({
				organizationId,
				id: item.id,
				action,
				...(quantity !== undefined ? { quantity } : {}),
				...(unitPrice !== undefined ? { unitPrice } : {}),
				...(editedName && editedName !== item.itemName
					? { itemName: editedName }
					: {}),
			});
			toast.success(
				action === "approve"
					? unitPrice === 0
						? "Item approved at no value — company covers it"
						: "Item approved — added to the worker's stock"
					: "Item denied",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Review failed",
			);
		}
	}

	return (
		<PermissionGate resource="installations" action="approve">
			<Card className="mb-4 border-amber-500/30">
				<CardHeader className="pb-2">
					<CardTitle className="flex items-center gap-2 text-base">
						<PackageMinusIcon className="size-4 text-amber-500" />
						Recovered equipment to review ({items.length})
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{items.map((item) => {
						const customer = item.task?.customer;
						const customerName = customer
							? displayName(
									customer.firstName,
									customer.lastName,
								) || customer.username
							: null;
						const quantity = Number(
							qtyEdits[item.id] ?? item.quantity,
						);
						const sellPrice = item.stockItem?.sellPrice ?? null;
						const effectivePrice =
							parsePriceInput(priceEdits[item.id]) ?? sellPrice;
						const stockValue =
							effectivePrice !== null &&
							Number.isInteger(quantity) &&
							quantity > 0
								? effectivePrice * quantity
								: null;
						return (
							<div
								key={item.id}
								className="rounded-md border p-3"
							>
								<div className="flex flex-wrap items-end gap-x-3 gap-y-2">
									<div className="min-w-44 flex-1">
										<label
											htmlFor={`rec-name-${item.id}`}
											className="mb-1 block text-[11px] font-medium text-muted-foreground"
										>
											Item
										</label>
										<Input
											id={`rec-name-${item.id}`}
											className="h-8"
											value={
												nameEdits[item.id] ??
												item.itemName
											}
											onChange={(e) =>
												setNameEdits((prev) => ({
													...prev,
													[item.id]: e.target.value,
												}))
											}
										/>
									</div>
									<div>
										<label
											htmlFor={`rec-qty-${item.id}`}
											className="mb-1 block text-[11px] font-medium text-muted-foreground"
										>
											Qty
										</label>
										<Input
											id={`rec-qty-${item.id}`}
											type="number"
											min={1}
											className="h-8 w-16 font-mono"
											value={
												qtyEdits[item.id] ??
												String(item.quantity)
											}
											onChange={(e) =>
												setQtyEdits((prev) => ({
													...prev,
													[item.id]: e.target.value,
												}))
											}
										/>
									</div>
									<div>
										<label
											htmlFor={`rec-price-${item.id}`}
											className="mb-1 block text-[11px] font-medium text-muted-foreground"
										>
											Unit price
										</label>
										<Input
											id={`rec-price-${item.id}`}
											type="number"
											min={0}
											step="0.01"
											inputMode="decimal"
											placeholder="auto"
											className="h-8 w-24 text-right font-mono"
											value={
												priceEdits[item.id] ??
												(sellPrice !== null
													? String(sellPrice)
													: "")
											}
											onChange={(e) =>
												setPriceEdits((prev) => ({
													...prev,
													[item.id]: e.target.value,
												}))
											}
										/>
									</div>
									{item.pictureUrl ? (
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setPhotoUrl(item.pictureUrl)
											}
										>
											<ImageIcon className="mr-1 size-3.5" />
											Photo
										</Button>
									) : (
										<span className="pb-1.5 text-xs text-muted-foreground">
											No photo
										</span>
									)}
									<div className="flex gap-1.5">
										<Button
											size="sm"
											disabled={review.isPending}
											onClick={() =>
												handleReview(item, "approve")
											}
										>
											<CheckIcon className="mr-1 size-3.5" />
											Approve
										</Button>
										<Button
											size="sm"
											variant="outline"
											disabled={review.isPending}
											onClick={() =>
												handleReview(item, "deny")
											}
										>
											<XIcon className="mr-1 size-3.5" />
											Deny
										</Button>
									</div>
								</div>
								<div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
									<p className="text-xs text-muted-foreground">
										{item.task?.completedByEmployee?.name ??
											"Unknown worker"}
										{customerName && ` · ${customerName}`}
									</p>
									{stockValue !== null &&
										(stockValue === 0 ? (
											<p className="text-[11px] font-medium text-success">
												Covered by company — worker's
												stock value won't increase
											</p>
										) : (
											<p className="text-[11px] text-muted-foreground tabular-nums">
												Adds{" "}
												{formatCurrency(stockValue)} to
												the worker's stock value
											</p>
										))}
								</div>
							</div>
						);
					})}
				</CardContent>
			</Card>
			{photoUrl && (
				<ImageViewerDialog
					open={!!photoUrl}
					onOpenChange={(open) => {
						if (!open) {
							setPhotoUrl(null);
						}
					}}
					src={photoUrl}
					title="Recovered equipment"
				/>
			)}
		</PermissionGate>
	);
}
