"use client";

import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PermissionGate } from "@shared/components/PermissionGate";
import { displayName } from "@shared/lib/display-name";
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

export function UninstalledItemsReview() {
	const organizationId = useOrganizationId();
	const { items, isLoading } = usePendingUninstalledItems();
	const review = useReviewUninstalledItem();
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
	const [nameEdits, setNameEdits] = useState<Record<string, string>>({});

	if (isLoading || items.length === 0) {
		return null;
	}

	async function handleReview(
		id: string,
		action: "approve" | "deny",
		quantity?: number,
		itemName?: string,
	) {
		if (!organizationId) {
			return;
		}
		try {
			await review.mutateAsync({
				organizationId,
				id,
				action,
				...(quantity !== undefined ? { quantity } : {}),
				...(itemName ? { itemName } : {}),
			});
			toast.success(
				action === "approve"
					? "Item approved — returned to stock"
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
						return (
							<div
								key={item.id}
								className="flex flex-wrap items-center gap-3 rounded-md border p-3"
							>
								<div className="min-w-40 flex-1">
									<Input
										className="h-8"
										value={
											nameEdits[item.id] ?? item.itemName
										}
										onChange={(e) =>
											setNameEdits((prev) => ({
												...prev,
												[item.id]: e.target.value,
											}))
										}
									/>
									<p className="mt-1 text-xs text-muted-foreground">
										{item.task?.completedByEmployee?.name ??
											"Unknown worker"}
										{customerName && ` · ${customerName}`}
									</p>
								</div>
								<Input
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
									<span className="text-xs text-muted-foreground">
										No photo
									</span>
								)}
								<div className="flex gap-1.5">
									<Button
										size="sm"
										disabled={review.isPending}
										onClick={() =>
											handleReview(
												item.id,
												"approve",
												Number(
													qtyEdits[item.id] ??
														item.quantity,
												),
												nameEdits[item.id]?.trim() &&
													nameEdits[item.id] !==
														item.itemName
													? nameEdits[item.id]
													: undefined,
											)
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
											handleReview(item.id, "deny")
										}
									>
										<XIcon className="mr-1 size-3.5" />
										Deny
									</Button>
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
