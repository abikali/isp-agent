"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { useState } from "react";
import { toast } from "sonner";
import { useDeliverToWorker, useReturnFromWorker } from "../hooks/use-stock";
import { QuantityInput } from "./QuantityInput";
import type { StockItem } from "./StockList";

export function DeliverToWorkerDialog({
	open,
	onOpenChange,
	item,
	mode,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: StockItem;
	mode: "deliver" | "return";
}) {
	const organizationId = useOrganizationId();
	const { employees } = useEmployeesQuery();
	const deliver = useDeliverToWorker();
	const returnStock = useReturnFromWorker();
	const [employeeId, setEmployeeId] = useState("");
	const [quantity, setQuantity] = useState(1);

	const isDeliver = mode === "deliver";
	const mutation = isDeliver ? deliver : returnStock;

	// For returns, only workers who actually hold this item
	const holders = item.workerAllocations.map((a) => a.employee.id);
	const selectable = isDeliver
		? employees
		: employees.filter((e) => holders.includes(e.id));

	const selectedAllocation = item.workerAllocations.find(
		(a) => a.employee.id === employeeId,
	);
	const maxQty = isDeliver
		? item.quantity
		: (selectedAllocation?.quantity ?? 0);

	async function handleSubmit() {
		if (!organizationId || !employeeId || quantity < 1) {
			return;
		}
		try {
			await mutation.mutateAsync({
				organizationId,
				id: item.id,
				employeeId,
				quantity,
			});
			toast.success(
				isDeliver
					? `Delivered ${quantity} × ${item.name}`
					: `Returned ${quantity} × ${item.name}`,
			);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Operation failed",
			);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{isDeliver ? "Deliver" : "Return"} — {item.name}
					</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label>Worker</Label>
						<Select
							value={employeeId}
							onValueChange={setEmployeeId}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select worker" />
							</SelectTrigger>
							<SelectContent>
								{selectable.map((emp) => (
									<SelectItem key={emp.id} value={emp.id}>
										{emp.name}
										{!isDeliver &&
											(() => {
												const alloc =
													item.workerAllocations.find(
														(a) =>
															a.employee.id ===
															emp.id,
													);
												return alloc
													? ` (holds ${alloc.quantity})`
													: "";
											})()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="deliver-qty">
							Quantity{" "}
							<span className="text-xs text-muted-foreground">
								(max {maxQty})
							</span>
						</Label>
						<QuantityInput
							id="deliver-qty"
							value={quantity}
							onChange={setQuantity}
							min={1}
							max={maxQty}
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
						disabled={
							mutation.isPending ||
							!employeeId ||
							quantity < 1 ||
							quantity > maxQty
						}
					>
						{mutation.isPending
							? "Saving..."
							: isDeliver
								? "Deliver"
								: "Return"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
