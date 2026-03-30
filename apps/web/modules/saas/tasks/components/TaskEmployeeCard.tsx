"use client";

import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { PlusIcon } from "lucide-react";

interface TaskEmployeeCardProps {
	assignments: Array<{
		employee: {
			id: string;
			name: string;
			employeeNumber: string;
			position?: string | null;
		};
	}>;
	onAssign: () => void;
	title?: string;
	emptyText?: string;
}

export function TaskEmployeeCard({
	assignments,
	onAssign,
	title = "Assigned Employees",
	emptyText = "No employees assigned yet.",
}: TaskEmployeeCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-base">{title}</CardTitle>
				<Button variant="outline" size="sm" onClick={onAssign}>
					<PlusIcon className="mr-1 size-3" />
					Assign
				</Button>
			</CardHeader>
			<CardContent>
				{assignments.length === 0 ? (
					<div className="flex flex-col items-center py-4 text-center">
						<p className="text-sm text-muted-foreground">
							{emptyText}
						</p>
						<Button
							variant="link"
							size="sm"
							className="mt-1"
							onClick={onAssign}
						>
							Assign employees
						</Button>
					</div>
				) : (
					<div className="space-y-2">
						{assignments.map((a) => (
							<div
								key={a.employee.id}
								className="flex items-center gap-3 rounded-md border p-2.5"
							>
								<div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
									{a.employee.name
										.split(" ")
										.map((n) => n[0])
										.join("")
										.slice(0, 2)
										.toUpperCase()}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium truncate">
										{a.employee.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{a.employee.employeeNumber}
										{a.employee.position
											? ` · ${a.employee.position}`
											: ""}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
