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
import { useState } from "react";
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
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Assign Workers</DialogTitle>
				</DialogHeader>
				{/* Remount on prop change so the local selection resets without a
				    mirror effect. */}
				<AssignEmployeeForm
					key={currentEmployeeIds.join(",")}
					taskId={taskId}
					currentEmployeeIds={currentEmployeeIds}
					onClose={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function AssignEmployeeForm({
	taskId,
	currentEmployeeIds,
	onClose,
}: {
	taskId: string;
	currentEmployeeIds: string[];
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const { employees } = useEmployeesQuery({ role: "worker" });
	const assignEmployees = useAssignTaskEmployees();
	const [selected, setSelected] = useState<string[]>(
		() => currentEmployeeIds,
	);

	async function handleSave() {
		if (!organizationId) {
			return;
		}
		await assignEmployees.mutateAsync({
			organizationId,
			taskId,
			employeeIds: selected,
		});
		onClose();
	}

	function toggleEmployee(employeeId: string) {
		setSelected((prev) =>
			prev.includes(employeeId)
				? prev.filter((id) => id !== employeeId)
				: [...prev, employeeId],
		);
	}

	const selectedIds = new Set(selected);

	return (
		<>
			<div className="max-h-60 space-y-2 overflow-y-auto">
				{employees.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No active workers available.
					</p>
				) : (
					employees.map((emp) => (
						<label
							key={emp.id}
							className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
						>
							<input
								type="checkbox"
								checked={selectedIds.has(emp.id)}
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
				<Button variant="outline" onClick={onClose}>
					Cancel
				</Button>
				<Button
					onClick={handleSave}
					disabled={assignEmployees.isPending}
				>
					{assignEmployees.isPending ? "Saving..." : "Save"}
				</Button>
			</DialogFooter>
		</>
	);
}
