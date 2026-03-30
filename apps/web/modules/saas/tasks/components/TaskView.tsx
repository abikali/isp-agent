"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Separator } from "@ui/components/separator";
import { cn } from "@ui/lib";
import {
	CalendarIcon,
	ClockIcon,
	EditIcon,
	MapPinIcon,
	TagIcon,
} from "lucide-react";
import { useState } from "react";
import { useDeleteTask } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { formatDate, formatDateTime, isOverdue } from "../lib/task-utils";
import { AssignEmployeeDialog } from "./AssignEmployeeDialog";
import { TaskCustomerCard } from "./TaskCustomerCard";
import { TaskEmployeeCard } from "./TaskEmployeeCard";
import { TaskOverdueWarning } from "./TaskOverdueWarning";

export function TaskView({ taskId }: { taskId: string }) {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });
	const deleteTask = useDeleteTask();
	const [showAssignEmployees, setShowAssignEmployees] = useState(false);

	const { data } = useSuspenseQuery(
		orpc.tasks.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				id: taskId,
			},
		}),
	);

	const task = data.task;
	const overdue = isOverdue(task.dueDate, task.status);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-bold">{task.title}</h1>
					</div>
					<div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
						<span
							className={cn(
								"inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium",
								TASK_STATUS_BG_COLORS[task.status],
							)}
						>
							{TASK_STATUS_LABELS[task.status] ?? task.status}
						</span>
						<span
							className={cn(
								"inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium",
								TASK_PRIORITY_BG_COLORS[task.priority],
							)}
						>
							{TASK_PRIORITY_LABELS[task.priority] ??
								task.priority}
						</span>
						<span className="inline-flex items-center gap-1">
							<TagIcon className="size-3" />
							{TASK_CATEGORY_LABELS[task.category] ??
								task.category}
						</span>
						<Separator orientation="vertical" className="h-4" />
						<span>
							{task.createdBy
								? `Created by ${task.createdBy.name}`
								: "System created"}
						</span>
						<span>{formatDate(task.createdAt)}</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						to="/app/$organizationSlug/tasks/$taskId/edit"
						params={{
							organizationSlug: organizationSlug ?? "",
							taskId,
						}}
						preload="intent"
					>
						<Button variant="outline" size="sm">
							<EditIcon className="mr-1.5 size-3.5" />
							Edit
						</Button>
					</Link>
					{task.status !== "CANCELLED" &&
						task.status !== "COMPLETED" && (
							<Button
								variant="destructive"
								size="sm"
								onClick={() => {
									if (
										organizationId &&
										confirm(
											"Cancel this task? It will be set to Cancelled.",
										)
									) {
										deleteTask.mutate({
											organizationId,
											id: taskId,
										});
									}
								}}
							>
								Cancel Task
							</Button>
						)}
				</div>
			</div>

			{/* Description */}
			{task.description && (
				<div className="rounded-lg border bg-muted/30 p-4">
					<p className="whitespace-pre-wrap text-sm">
						{task.description}
					</p>
				</div>
			)}

			{/* Due date warning */}
			{overdue && (
				<TaskOverdueWarning dueDate={task.dueDate} label="task" />
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Left column: Details + Notes + Conversation */}
				<div className="space-y-6 lg:col-span-2">
					{/* Key details */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Details</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
								{task.dueDate && (
									<div>
										<dt className="text-muted-foreground">
											Due Date
										</dt>
										<dd
											className={cn(
												"mt-0.5 flex items-center gap-1.5 font-medium",
												overdue
													? "text-red-600 dark:text-red-400"
													: "",
											)}
										>
											<CalendarIcon className="size-3.5" />
											{formatDate(task.dueDate)}
										</dd>
									</div>
								)}
								{task.completedAt && (
									<div>
										<dt className="text-muted-foreground">
											Completed
										</dt>
										<dd className="mt-0.5 flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
											<ClockIcon className="size-3.5" />
											{formatDateTime(task.completedAt)}
										</dd>
									</div>
								)}
								{task.station && (
									<div>
										<dt className="text-muted-foreground">
											Station
										</dt>
										<dd className="mt-0.5 flex items-center gap-1.5 font-medium">
											<MapPinIcon className="size-3.5" />
											{task.station.name}
											{task.station.address && (
												<span className="font-normal text-muted-foreground">
													— {task.station.address}
												</span>
											)}
										</dd>
									</div>
								)}
							</dl>
						</CardContent>
					</Card>

					{/* Notes */}
					{task.notes && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Notes
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
									{task.notes}
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				{/* Right column: Customer + Employees */}
				<div className="space-y-6">
					{/* Customer Card */}
					{task.customer && (
						<TaskCustomerCard
							customer={task.customer}
							organizationSlug={organizationSlug ?? ""}
						/>
					)}

					{/* Assigned Employees */}
					<TaskEmployeeCard
						assignments={task.assignments}
						onAssign={() => setShowAssignEmployees(true)}
					/>
				</div>
			</div>

			<AssignEmployeeDialog
				open={showAssignEmployees}
				onOpenChange={setShowAssignEmployees}
				taskId={taskId}
				currentEmployeeIds={task.assignments.map((a) => a.employee.id)}
			/>
		</div>
	);
}
