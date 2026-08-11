"use client";

import {
	useActiveOrganization,
	useCanAccess,
} from "@saas/organizations/client";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import {
	formatDate,
	formatDateTime,
	MEDIUM_DATE_FORMAT,
	MEDIUM_DATE_TIME_FORMAT,
} from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { cn } from "@ui/lib";
import { CheckIcon, EditIcon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDeleteTask, useReviewTaskCompletion } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_SOURCE_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { isOverdue, isReturned } from "../lib/task-utils";
import { AssignEmployeeDialog } from "./AssignEmployeeDialog";
import { TaskCustomerCard } from "./TaskCustomerCard";
import { TaskEmployeeCard } from "./TaskEmployeeCard";
import { TaskEvidenceCard } from "./TaskEvidenceCard";
import { TaskOverdueWarning } from "./TaskOverdueWarning";

const PILL =
	"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium";

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive task detail view; status/review actions and the detail layout share one data flow, sub-cards are already extracted
export function TaskView({ taskId }: { taskId: string }) {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });
	const deleteTask = useDeleteTask();
	const reviewCompletion = useReviewTaskCompletion();
	// Synchronous, pre-fetched permission check (same as PermissionGate) — the
	// async useHasPermission latched to false on any failed request, hiding
	// the Approve/Reject completion buttons intermittently.
	const { isOrganizationAdmin } = useActiveOrganization();
	const canAccess = useCanAccess();
	const canApprove = isOrganizationAdmin || canAccess("tasks", "approve");
	const [showAssignEmployees, setShowAssignEmployees] = useState(false);

	const reviewTask = async (action: "approve" | "reject") => {
		if (!organizationId) {
			return;
		}
		let note: string | undefined;
		if (action === "reject") {
			const answer = prompt(
				"Reject this completion? The task returns to the worker's queue.\nReason (optional):",
			);
			if (answer === null) {
				return;
			}
			note = answer.trim() || undefined;
		}
		try {
			await reviewCompletion.mutateAsync({
				organizationId,
				taskId,
				action,
				...(note ? { note } : {}),
			});
			toast.success(
				action === "approve"
					? "Task completion approved"
					: "Completion rejected — task returned to the worker",
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to review completion",
			);
		}
	};

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
	const cancellable =
		task.status !== "CANCELLED" && task.status !== "COMPLETED";
	const awaitingApproval = task.status === "PENDING_APPROVAL";

	return (
		<PageShell
			title={task.title}
			backTo={`/app/${organizationSlug}/tasks`}
			backLabel="Tasks"
			// react-doctor-disable-next-line react-doctor/jsx-no-jsx-as-prop -- slot prop like header/actions; inline JSX is canonical and child is not memoized
			badges={
				<span className="flex flex-wrap items-center gap-2">
					<span
						className={cn(PILL, TASK_STATUS_BG_COLORS[task.status])}
					>
						{TASK_STATUS_LABELS[task.status] ?? task.status}
					</span>
					{isReturned(task) && (
						<span
							className={cn(
								PILL,
								"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
							)}
						>
							Returned
						</span>
					)}
					<span
						className={cn(
							PILL,
							TASK_PRIORITY_BG_COLORS[task.priority],
						)}
					>
						{TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
					</span>
					<Badge variant="outline">
						{TASK_CATEGORY_LABELS[task.category] ?? task.category}
					</Badge>
					{task.source === "LEGACY" && (
						<Badge variant="outline">Legacy</Badge>
					)}
				</span>
			}
			actions={
				<>
					{awaitingApproval && canApprove && (
						<>
							<Button
								size="sm"
								onClick={() => reviewTask("approve")}
								disabled={reviewCompletion.isPending}
							>
								<CheckIcon className="mr-1.5 size-3.5" />
								Approve completion
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => reviewTask("reject")}
								disabled={reviewCompletion.isPending}
							>
								<UndoIcon className="mr-1.5 size-3.5" />
								Reject
							</Button>
						</>
					)}
					<Button asChild variant="outline" size="sm">
						<Link
							to="/app/$organizationSlug/tasks/$taskId/edit"
							params={{
								organizationSlug: organizationSlug ?? "",
								taskId,
							}}
							preload="intent"
						>
							<EditIcon className="mr-1.5 size-3.5" />
							Edit
						</Link>
					</Button>
					{cancellable && (
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
							Cancel task
						</Button>
					)}
				</>
			}
		>
			{overdue && (
				<TaskOverdueWarning dueDate={task.dueDate} label="task" />
			)}

			{awaitingApproval && (
				<div className="rounded-lg border border-purple-200 bg-purple-50 p-4 text-purple-800 text-sm dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300">
					This task was completed in the field and is awaiting admin
					approval.
					{canApprove
						? " Review the evidence below, then approve or reject it."
						: ""}
				</div>
			)}

			{task.description && (
				<div className="rounded-lg border bg-muted/30 p-4">
					<p className="whitespace-pre-wrap text-sm leading-relaxed">
						{task.description}
					</p>
				</div>
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Details</CardTitle>
						</CardHeader>
						<CardContent>
							<PropertyList
								columns={2}
								items={[
									{
										label: "Created by",
										value: task.createdBy?.name ?? "System",
									},
									{
										label: "Created",
										value: formatDate(
											task.createdAt,
											MEDIUM_DATE_FORMAT,
										),
									},
									{
										label: "Source",
										value:
											TASK_SOURCE_LABELS[task.source] ??
											task.source,
									},
									{
										label: "Due date",
										value: task.dueDate ? (
											<span
												className={cn(
													overdue &&
														"font-medium text-red-600 dark:text-red-400",
												)}
											>
												{formatDate(
													task.dueDate,
													MEDIUM_DATE_FORMAT,
												)}
											</span>
										) : null,
									},
									{
										label: "Completed",
										value: task.completedAt
											? formatDateTime(
													task.completedAt,
													MEDIUM_DATE_TIME_FORMAT,
												)
											: null,
									},
									{
										label: "Station",
										value: task.station
											? task.station.address
												? `${task.station.name} — ${task.station.address}`
												: task.station.name
											: null,
									},
								]}
							/>
						</CardContent>
					</Card>

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

					{task.installations.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Items used
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2">
								{task.installations.map((item) => (
									<div
										key={item.id}
										className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
									>
										<span>
											{item.stockItem?.name ?? "Item"} ×
											{item.quantity}
										</span>
										<Badge variant="outline">
											{item.status.toLowerCase()}
										</Badge>
									</div>
								))}
							</CardContent>
						</Card>
					)}

					<TaskEvidenceCard task={task} />
				</div>

				<div className="space-y-6">
					{task.customer && (
						<TaskCustomerCard
							customer={task.customer}
							organizationSlug={organizationSlug ?? ""}
						/>
					)}

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
		</PageShell>
	);
}
