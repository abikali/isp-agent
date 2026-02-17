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
import { useEffect, useState } from "react";
import { useAssignTaskEmployees } from "../hooks/use-tasks";

export function AssignEmployeeDialog({
	open,
	onOpenChange,
	taskId,
	currentEmployeeIds,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	taskId: string;
	currentEmployeeIds: string[];
}) {
	const organizationId = useOrganizationId();
	const { employees } = useEmployeesQuery();
	const assignEmployees = useAssignTaskEmployees();
	const [selected, setSelected] = useState<string[]>(currentEmployeeIds);

	useEffect(() => {
		setSelected(currentEmployeeIds);
	}, [currentEmployeeIds]);

	async function handleSave() {
		if (!organizationId) {
			return;
		}
		await assignEmployees.mutateAsync({
			organizationId,
			taskId,
			employeeIds: selected,
		});
		onOpenChange(false);
	}

	function toggleEmployee(employeeId: string) {
		setSelected((prev) =>
			prev.includes(employeeId)
				? prev.filter((id) => id !== employeeId)
				: [...prev, employeeId],
		);
	}

	// Filter to only ACTIVE employees
	const activeEmployees = employees.filter((e) => e.status === "ACTIVE");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Assign Employees</DialogTitle>
				</DialogHeader>
				<div className="max-h-60 space-y-2 overflow-y-auto">
					{activeEmployees.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No active employees available.
						</p>
					) : (
						activeEmployees.map((emp) => (
							<label
								key={emp.id}
								className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
							>
								<input
									type="checkbox"
									checked={selected.includes(emp.id)}
									onChange={() => toggleEmployee(emp.id)}
									className="size-4"
								/>
								<div>
									<span className="text-sm font-medium">
										{emp.name}
									</span>
									{emp.position && (
										<p className="text-xs text-muted-foreground">
											{emp.position}
										</p>
									)}
								</div>
							</label>
						))
					)}
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={assignEmployees.isPending}
					>
						{assignEmployees.isPending ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
