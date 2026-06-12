"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
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
import { Switch } from "@ui/components/switch";
import { toast } from "sonner";
import { useCreateStockItem, useUpdateStockItem } from "../hooks/use-stock";
import type { StockItem } from "./StockList";

export function StockItemDialog({
	open,
	onOpenChange,
	item,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: StockItem | null;
}) {
	const organizationId = useOrganizationId();
	const createItem = useCreateStockItem();
	const updateItem = useUpdateStockItem();
	const isEdit = item !== null;

	const form = useForm({
		defaultValues: {
			name: item?.name ?? "",
			quantity: item?.quantity ?? 0,
			costPrice: item?.costPrice ?? 0,
			sellPrice: item?.sellPrice ?? 0,
			alertThreshold: item?.alertThreshold ?? null,
			alertEnabled: item?.alertEnabled ?? false,
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			try {
				if (isEdit) {
					await updateItem.mutateAsync({
						organizationId,
						id: item.id,
						name: value.name,
						costPrice: value.costPrice,
						sellPrice: value.sellPrice,
						alertThreshold: value.alertThreshold,
						alertEnabled: value.alertEnabled,
					});
					toast.success("Item updated");
				} else {
					await createItem.mutateAsync({
						organizationId,
						name: value.name,
						quantity: value.quantity,
						costPrice: value.costPrice,
						sellPrice: value.sellPrice,
						...(value.alertThreshold !== null && {
							alertThreshold: value.alertThreshold,
						}),
						alertEnabled: value.alertEnabled,
					});
					toast.success("Item created");
				}
				onOpenChange(false);
				form.reset();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to save item",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Edit Item" : "Add Stock Item"}
					</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{(field) => (
							<div className="space-y-1.5">
								<Label htmlFor="stock-item-name">Name *</Label>
								<Input
									id="stock-item-name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									placeholder="e.g. TP-Link Router"
									required
								/>
							</div>
						)}
					</form.Field>

					{!isEdit && (
						<form.Field name="quantity">
							{(field) => (
								<div className="space-y-1.5">
									<Label htmlFor="stock-item-qty">
										Initial quantity
									</Label>
									<Input
										id="stock-item-qty"
										type="number"
										min={0}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(
												Number(e.target.value),
											)
										}
									/>
								</div>
							)}
						</form.Field>
					)}

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="costPrice">
							{(field) => (
								<div className="space-y-1.5">
									<Label htmlFor="stock-item-cost">
										Cost price ($)
									</Label>
									<Input
										id="stock-item-cost"
										type="number"
										min={0}
										step="0.01"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(
												Number(e.target.value),
											)
										}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="sellPrice">
							{(field) => (
								<div className="space-y-1.5">
									<Label htmlFor="stock-item-sell">
										Sell price ($)
									</Label>
									<Input
										id="stock-item-sell"
										type="number"
										min={0}
										step="0.01"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(
												Number(e.target.value),
											)
										}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="alertEnabled">
						{(field) => (
							<div className="flex items-center justify-between rounded-md border p-3">
								<div>
									<Label htmlFor="stock-item-alert">
										Low-stock alert
									</Label>
									<p className="text-xs text-muted-foreground">
										Notify when stock falls to the threshold
									</p>
								</div>
								<Switch
									id="stock-item-alert"
									checked={field.state.value}
									onCheckedChange={field.handleChange}
								/>
							</div>
						)}
					</form.Field>

					<form.Subscribe selector={(s) => s.values.alertEnabled}>
						{(alertEnabled) =>
							alertEnabled ? (
								<form.Field name="alertThreshold">
									{(field) => (
										<div className="space-y-1.5">
											<Label htmlFor="stock-item-threshold">
												Alert threshold
											</Label>
											<Input
												id="stock-item-threshold"
												type="number"
												min={0}
												value={field.state.value ?? ""}
												onChange={(e) =>
													field.handleChange(
														e.target.value === ""
															? null
															: Number(
																	e.target
																		.value,
																),
													)
												}
												placeholder="e.g. 5"
											/>
										</div>
									)}
								</form.Field>
							) : null
						}
					</form.Subscribe>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting
								? "Saving..."
								: isEdit
									? "Save changes"
									: "Create item"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
