"use client";

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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Separator } from "@ui/components/separator";
import { cn } from "@ui/lib";
import {
	BotIcon,
	CalendarIcon,
	ClockIcon,
	ExternalLinkIcon,
	MapPinIcon,
	MessageSquareIcon,
	TagIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDeleteTask, useUpdateTask } from "../hooks/use-tasks";
import {
	FOLLOW_UP_STATUS_LABELS,
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { isOverdue } from "../lib/task-utils";
import { AssignEmployeeDialog } from "./AssignEmployeeDialog";
import { TaskCustomerCard } from "./TaskCustomerCard";
import { TaskEmployeeCard } from "./TaskEmployeeCard";
import { TaskOverdueWarning } from "./TaskOverdueWarning";

export function EscalationView({ taskId }: { taskId: string }) {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });
	const deleteTask = useDeleteTask();
	const updateTask = useUpdateTask();
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
	const conversationMessages = task.conversation?.messages ?? [];

	function handleFollowUpChange(
		value: "pending" | "contacted" | "promised" | "resolved" | "escalated",
	) {
		if (!organizationId) {
			return;
		}
		updateTask.mutate(
			{
				organizationId,
				id: taskId,
				followUpStatus: value,
			},
			{
				onSuccess: () => toast.success("Follow-up status updated"),
				onError: (err) =>
					toast.error(
						err instanceof Error ? err.message : "Failed to update",
					),
			},
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-bold">{task.title}</h1>
						<Badge variant="secondary" className="gap-1">
							<BotIcon className="size-3" />
							AI Escalation
						</Badge>
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
						<span>Created by AI Agent</span>
						<span>
							{formatDate(task.createdAt, MEDIUM_DATE_FORMAT)}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						to="/app/$organizationSlug/escalations/$taskId/edit"
						params={{
							organizationSlug: organizationSlug ?? "",
							taskId,
						}}
						preload="intent"
					>
						<Button variant="outline" size="sm">
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
										confirm("Cancel this escalation?")
									) {
										deleteTask.mutate({
											organizationId,
											id: taskId,
										});
									}
								}}
							>
								Cancel
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

			{/* Overdue warning */}
			{overdue && (
				<TaskOverdueWarning dueDate={task.dueDate} label="escalation" />
			)}

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Left column */}
				<div className="space-y-6 lg:col-span-2">
					{/* Follow-up & Details */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Escalation Details
							</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
								<div>
									<dt className="text-muted-foreground">
										Follow-up Status
									</dt>
									<dd className="mt-1">
										<Select
											value={
												((
													task as Record<
														string,
														unknown
													>
												).followUpStatus as string) ??
												"pending"
											}
											onValueChange={(v) =>
												handleFollowUpChange(
													v as
														| "pending"
														| "contacted"
														| "promised"
														| "resolved"
														| "escalated",
												)
											}
										>
											<SelectTrigger className="h-8 w-full sm:w-[160px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(
													FOLLOW_UP_STATUS_LABELS,
												).map(([value, label]) => (
													<SelectItem
														key={value}
														value={value}
													>
														{label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</dd>
								</div>
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
											{formatDate(
												task.dueDate,
												MEDIUM_DATE_FORMAT,
											)}
										</dd>
									</div>
								)}
								{task.completedAt && (
									<div>
										<dt className="text-muted-foreground">
											Resolved
										</dt>
										<dd className="mt-0.5 flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
											<ClockIcon className="size-3.5" />
											{formatDateTime(
												task.completedAt,
												MEDIUM_DATE_TIME_FORMAT,
											)}
										</dd>
									</div>
								)}
								{task.conversation && (
									<div>
										<dt className="text-muted-foreground">
											AI Conversation
										</dt>
										<dd className="mt-0.5">
											<Link
												to="/app/$organizationSlug/ai-agents/$agentId/conversations/$conversationId"
												params={{
													organizationSlug:
														organizationSlug ?? "",
													agentId:
														task.conversation.agent
															.id,
													conversationId:
														task.conversation.id,
												}}
												className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
												preload="intent"
											>
												<MessageSquareIcon className="size-3.5" />
												{task.conversation
													.contactName ??
													"Unknown contact"}{" "}
												via{" "}
												{task.conversation.agent.name}
												<ExternalLinkIcon className="size-3" />
											</Link>
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

					{/* Conversation Snippet */}
					{conversationMessages.length > 0 && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle className="text-base">
									Conversation Leading to Escalation
								</CardTitle>
								{task.conversation && (
									<Link
										to="/app/$organizationSlug/ai-agents/$agentId/conversations/$conversationId"
										params={{
											organizationSlug:
												organizationSlug ?? "",
											agentId: task.conversation.agent.id,
											conversationId:
												task.conversation.id,
										}}
										preload="intent"
									>
										<Button variant="ghost" size="sm">
											View full conversation
											<ExternalLinkIcon className="ml-1 size-3" />
										</Button>
									</Link>
								)}
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									{[...conversationMessages]
										.reverse()
										.map((msg) => (
											<div
												key={msg.id}
												className={cn(
													"flex gap-3",
													msg.role === "assistant"
														? ""
														: "flex-row-reverse",
												)}
											>
												<div
													className={cn(
														"max-w-[80%] rounded-lg px-3 py-2 text-sm",
														msg.role === "assistant"
															? "bg-muted"
															: "bg-primary/10",
													)}
												>
													<div className="mb-1 text-[10px] font-medium uppercase text-muted-foreground">
														{msg.role === "user"
															? (task.conversation
																	?.contactName ??
																"Customer")
															: "AI Agent"}
													</div>
													<p className="line-clamp-4 whitespace-pre-wrap">
														{msg.content}
													</p>
													<div className="mt-1 text-[10px] text-muted-foreground">
														{formatDateTime(
															msg.createdAt,
															MEDIUM_DATE_TIME_FORMAT,
														)}
													</div>
												</div>
											</div>
										))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>

				{/* Right column */}
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
						title="Assigned To"
						emptyText="No one assigned yet."
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
