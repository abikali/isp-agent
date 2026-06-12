"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { useState } from "react";
import { useWorkerStockQuery } from "../hooks/use-stock";

export function WorkerAllocationsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { employees } = useEmployeesQuery();
	const [employeeId, setEmployeeId] = useState<string | null>(null);
	const { allocations, totalValue, isLoading } =
		useWorkerStockQuery(employeeId);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Worker Stock</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<Select
						value={employeeId ?? ""}
						onValueChange={setEmployeeId}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select worker" />
						</SelectTrigger>
						<SelectContent>
							{employees.map((emp) => (
								<SelectItem key={emp.id} value={emp.id}>
									{emp.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{employeeId &&
						(isLoading ? (
							<p className="py-4 text-center text-sm text-muted-foreground">
								Loading…
							</p>
						) : allocations.length === 0 ? (
							<p className="py-4 text-center text-sm text-muted-foreground">
								This worker holds no stock.
							</p>
						) : (
							<div className="space-y-2">
								{allocations.map((alloc) => (
									<div
										key={alloc.id}
										className="flex items-center justify-between rounded-md border p-3"
									>
										<div>
											<p className="text-sm font-medium">
												{alloc.stockItem.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{formatCurrency(
													alloc.unitPrice,
												)}{" "}
												each
											</p>
										</div>
										<span className="font-mono text-sm tabular-nums">
											× {alloc.quantity}
										</span>
									</div>
								))}
								<div className="flex items-center justify-between border-t pt-2 text-sm">
									<span className="text-muted-foreground">
										Total value
									</span>
									<span className="font-mono font-medium tabular-nums">
										{formatCurrency(totalValue)}
									</span>
								</div>
							</div>
						))}
				</div>
				<Button variant="outline" onClick={() => onOpenChange(false)}>
					Close
				</Button>
			</DialogContent>
		</Dialog>
	);
}
