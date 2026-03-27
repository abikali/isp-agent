"use client";

import { displayName } from "@shared/lib/display-name";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Separator } from "@ui/components/separator";
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	BotIcon,
	CalendarIcon,
	ClockIcon,
	DollarSignIcon,
	EditIcon,
	ExternalLinkIcon,
	MailIcon,
	MapPinIcon,
	MessageSquareIcon,
	PhoneIcon,
	PlusIcon,
	TagIcon,
	UserIcon,
	WifiIcon,
} from "lucide-react";
import { useState } from "react";
import { useDeleteTask } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_SOURCE_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { AssignEmployeeDialog } from "./AssignEmployeeDialog";

function formatDate(date: string | Date): string {
	return new Date(date).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function formatDateTime(date: string | Date): string {
	return new Date(date).toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function isOverdue(dueDate: string | Date | null, status: string): boolean {
	if (!dueDate || status === "COMPLETED" || status === "CANCELLED") {
		return false;
	}
	return new Date(dueDate) < new Date();
}

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
	const isAiEscalation = task.source === "AI_ESCALATION";
	const overdue = isOverdue(task.dueDate, task.status);
	const conversationMessages = task.conversation?.messages ?? [];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-bold">{task.title}</h1>
						{isAiEscalation && (
							<Badge variant="secondary" className="gap-1">
								<BotIcon className="size-3" />
								{TASK_SOURCE_LABELS[task.source]}
							</Badge>
						)}
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
								: isAiEscalation
									? "Created by AI Agent"
									: "Unknown creator"}
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
				<div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
					<AlertTriangleIcon className="size-4 shrink-0" />
					<span>
						This task is overdue — was due{" "}
						{task.dueDate ? formatDate(task.dueDate) : ""}
					</span>
				</div>
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
									Conversation Snippet
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

				{/* Right column: Customer + Employees */}
				<div className="space-y-6">
					{/* Customer Card */}
					{task.customer && (
						<Card>
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle className="text-base">
									Customer
								</CardTitle>
								<Link
									to="/app/$organizationSlug/customers/$customerId"
									params={{
										organizationSlug:
											organizationSlug ?? "",
										customerId: task.customer.id,
									}}
									preload="intent"
								>
									<Button variant="ghost" size="sm">
										View
										<ExternalLinkIcon className="ml-1 size-3" />
									</Button>
								</Link>
							</CardHeader>
							<CardContent className="space-y-3">
								<div className="flex items-center gap-3">
									<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
										<UserIcon className="size-5" />
									</div>
									<div>
										<p className="font-medium">
											{displayName(
												task.customer.firstName,
												task.customer.lastName,
											)}
										</p>
										<p className="text-xs text-muted-foreground">
											#{task.customer.accountNumber}
										</p>
									</div>
									<Badge
										variant={
											task.customer.status === "ACTIVE"
												? "default"
												: "secondary"
										}
										className="ml-auto text-[10px]"
									>
										{task.customer.status}
									</Badge>
								</div>
								<Separator />
								<div className="space-y-2 text-sm">
									{task.customer.phone && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<PhoneIcon className="size-3.5 shrink-0" />
											<span>{task.customer.phone}</span>
										</div>
									)}
									{task.customer.email && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<MailIcon className="size-3.5 shrink-0" />
											<span className="truncate">
												{task.customer.email}
											</span>
										</div>
									)}
									{task.customer.address && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<MapPinIcon className="size-3.5 shrink-0" />
											<span>{task.customer.address}</span>
										</div>
									)}
									{task.customer.connectionType && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<WifiIcon className="size-3.5 shrink-0" />
											<span>
												{task.customer.connectionType}
											</span>
										</div>
									)}
									{task.customer.plan && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<TagIcon className="size-3.5 shrink-0" />
											<span>
												{task.customer.plan.name}
											</span>
										</div>
									)}
									{task.customer.monthlyRate != null && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<DollarSignIcon className="size-3.5 shrink-0" />
											<span>
												$
												{task.customer.monthlyRate.toFixed(
													2,
												)}
												/mo
											</span>
										</div>
									)}
									{task.customer.station && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<MapPinIcon className="size-3.5 shrink-0" />
											<span>
												Station:{" "}
												{task.customer.station.name}
											</span>
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Assigned Employees */}
					<Card>
						<CardHeader className="flex flex-row items-center justify-between">
							<CardTitle className="text-base">
								Assigned Employees
							</CardTitle>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowAssignEmployees(true)}
							>
								<PlusIcon className="mr-1 size-3" />
								Assign
							</Button>
						</CardHeader>
						<CardContent>
							{task.assignments.length === 0 ? (
								<div className="flex flex-col items-center py-4 text-center">
									<p className="text-sm text-muted-foreground">
										No employees assigned yet.
									</p>
									<Button
										variant="link"
										size="sm"
										className="mt-1"
										onClick={() =>
											setShowAssignEmployees(true)
										}
									>
										Assign employees
									</Button>
								</div>
							) : (
								<div className="space-y-2">
									{task.assignments.map((a) => (
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
