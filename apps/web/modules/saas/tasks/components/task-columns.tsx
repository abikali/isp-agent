"use client";

import { displayName } from "@shared/lib/display-name";
import { formatDate, formatDateTime } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	BotIcon,
	CheckCircle2Icon,
	ClockIcon,
	MapPinIcon,
	PackageMinusIcon,
	PackagePlusIcon,
	StickyNoteIcon,
	UserIcon,
} from "lucide-react";
import { useMemo } from "react";

import type { TaskListItem } from "../hooks/use-tasks";
import {
	FOLLOW_UP_STATUS_COLORS,
	FOLLOW_UP_STATUS_LABELS,
	TASK_CATEGORY_BG_COLORS,
	TASK_CATEGORY_ICONS,
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { isOverdue } from "../lib/task-utils";
import { TaskRowActions } from "./TaskRowActions";

export const TASK_TOGGLEABLE_COLUMNS = [
	{ id: "title", label: "Task", alwaysVisible: true },
	{ id: "customer", label: "Customer / target" },
	{ id: "worker", label: "Worker" },
	{ id: "items", label: "Items" },
	{ id: "status", label: "Status" },
	{ id: "priority", label: "Priority" },
	{ id: "dueDate", label: "Timeline" },
	{ id: "actions", label: "Actions", alwaysVisible: true },
];

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.filter(Boolean)
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function formatRelativeDate(date: string | Date): string {
	const d = new Date(date);
	const now = new Date();
	const diffMs = d.getTime() - now.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < -1) {
		return `${Math.abs(diffDays)} days overdue`;
	}
	if (diffDays === -1) {
		return "1 day overdue";
	}
	if (diffDays === 0) {
		return "Due today";
	}
	if (diffDays === 1) {
		return "Due tomorrow";
	}
	if (diffDays <= 7) {
		return `Due in ${diffDays} days`;
	}
	return formatDate(d);
}

function InitialsAvatar({
	name,
	tone = "muted",
}: {
	name: string;
	tone?: "muted" | "success";
}) {
	return (
		<span
			className={cn(
				"inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
				tone === "success"
					? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
					: "bg-muted text-foreground/70",
			)}
			title={name}
		>
			{getInitials(name)}
		</span>
	);
}

export function useTaskColumns(organizationSlug: string) {
	return useMemo<ColumnDef<TaskListItem, unknown>[]>(
		() => [
			{
				id: "title",
				header: "Task",
				accessorFn: (row) => row.title,
				enableSorting: true,
				meta: { className: "min-w-[260px]" },
				cell: ({ row }) => {
					const task = row.original;
					const CategoryIcon =
						TASK_CATEGORY_ICONS[task.category] ?? UserIcon;
					return (
						<div className="space-y-1">
							<div className="flex flex-wrap items-center gap-2">
								<span
									className={cn(
										"size-2 shrink-0 rounded-full",
										TASK_STATUS_COLORS[task.status],
									)}
								/>
								<Link
									to="/app/$organizationSlug/tasks/$taskId"
									params={{
										organizationSlug,
										taskId: task.id,
									}}
									className="font-medium hover:underline"
									preload="intent"
								>
									{task.title}
								</Link>
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-md border px-1.5 py-0 text-[10px] font-medium",
										TASK_CATEGORY_BG_COLORS[task.category],
									)}
								>
									<CategoryIcon className="size-2.5" />
									{TASK_CATEGORY_LABELS[task.category]}
								</span>
								{task.source === "LEGACY" && (
									<Badge
										variant="outline"
										className="px-1.5 py-0 text-[10px]"
									>
										Legacy
									</Badge>
								)}
								{task.source === "AI_ESCALATION" && (
									<Badge
										variant="info"
										className="gap-1 px-1.5 py-0 text-[10px]"
									>
										<BotIcon className="size-2.5" />
										AI
									</Badge>
								)}
							</div>
							{task.description && (
								<p className="line-clamp-1 pl-4 text-xs text-muted-foreground">
									{task.description}
								</p>
							)}
							{task.notes && (
								<div className="flex items-center gap-1 pl-4 text-xs text-muted-foreground">
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="inline-flex cursor-default items-center gap-1">
												<StickyNoteIcon className="size-3 text-amber-600" />
												Note
											</span>
										</TooltipTrigger>
										<TooltipContent
											side="bottom"
											className="max-w-xs"
										>
											<p className="line-clamp-4 text-xs">
												{task.notes}
											</p>
										</TooltipContent>
									</Tooltip>
								</div>
							)}
						</div>
					);
				},
			},
			{
				id: "customer",
				header: "Customer / target",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					if (task.customer) {
						const name = displayName(
							task.customer.firstName,
							task.customer.lastName,
						);
						const phone =
							task.customer.mobile ?? task.customer.phone;
						return (
							<div className="flex min-w-0 items-center gap-2">
								<InitialsAvatar name={name} />
								<div className="min-w-0">
									<Link
										to="/app/$organizationSlug/customers/$customerId"
										params={{
											organizationSlug,
											customerId: task.customer.id,
										}}
										className="block truncate text-sm font-medium hover:underline"
										preload="intent"
									>
										{name}
									</Link>
									<p className="truncate text-xs text-muted-foreground">
										{task.customer.accountNumber && (
											<span className="font-mono">
												#{task.customer.accountNumber}
											</span>
										)}
										{phone && (
											<span>
												{task.customer
													.accountNumber && (
													<span className="mx-1">
														·
													</span>
												)}
												{phone}
											</span>
										)}
									</p>
								</div>
							</div>
						);
					}
					const target = task.base ?? task.station;
					if (target) {
						return (
							<span className="inline-flex items-center gap-1.5 text-sm">
								<MapPinIcon className="size-3.5 text-muted-foreground" />
								{target.name}
							</span>
						);
					}
					return <span className="text-muted-foreground">—</span>;
				},
			},
			{
				id: "worker",
				header: "Worker",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					const done = task.completedByEmployee;
					if (done) {
						return (
							<div className="flex items-center gap-1.5">
								<InitialsAvatar
									name={done.name}
									tone="success"
								/>
								<div className="leading-tight">
									<span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
										<CheckCircle2Icon className="size-3" />
										Done by
									</span>
									<span className="text-sm">{done.name}</span>
								</div>
							</div>
						);
					}
					if (task.assignments.length > 0) {
						return (
							<div className="flex items-center gap-1">
								{task.assignments.slice(0, 3).map((a) => (
									<InitialsAvatar
										key={a.employee.id}
										name={a.employee.name}
									/>
								))}
								{task.assignments.length > 3 && (
									<span className="text-xs text-muted-foreground">
										+{task.assignments.length - 3}
									</span>
								)}
							</div>
						);
					}
					return (
						<span className="text-xs text-muted-foreground">
							Unassigned
						</span>
					);
				},
			},
			{
				id: "items",
				header: "Items",
				enableSorting: false,
				meta: { className: "hidden xl:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					const used = task.installations ?? [];
					const recovered = task.uninstalledItems ?? [];
					if (used.length === 0 && recovered.length === 0) {
						return <span className="text-muted-foreground">—</span>;
					}
					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex cursor-default items-center gap-2 text-xs">
									{used.length > 0 && (
										<span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
											<PackagePlusIcon className="size-3.5" />
											{used.length}
										</span>
									)}
									{recovered.length > 0 && (
										<span className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
											<PackageMinusIcon className="size-3.5" />
											{recovered.length}
										</span>
									)}
								</div>
							</TooltipTrigger>
							<TooltipContent side="left" className="max-w-xs">
								<div className="space-y-1.5 text-xs">
									{used.length > 0 && (
										<div>
											<p className="font-medium">
												Items used
											</p>
											{used.map((i) => (
												<p
													key={i.id}
													className="text-muted-foreground"
												>
													{i.stockItem?.name ??
														"Item"}{" "}
													×{i.quantity}
												</p>
											))}
										</div>
									)}
									{recovered.length > 0 && (
										<div>
											<p className="font-medium">
												Recovered
											</p>
											{recovered.map((i) => (
												<p
													key={i.id}
													className="text-muted-foreground"
												>
													{i.itemName} ×{i.quantity}
												</p>
											))}
										</div>
									)}
								</div>
							</TooltipContent>
						</Tooltip>
					);
				},
			},
			{
				id: "status",
				header: "Status",
				accessorFn: (row) => row.status,
				enableSorting: true,
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					return (
						<div className="flex flex-col items-start gap-1">
							<span
								className={cn(
									"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
									TASK_STATUS_BG_COLORS[task.status],
								)}
							>
								{TASK_STATUS_LABELS[task.status] ?? task.status}
							</span>
							{task.followUpStatus && (
								<span
									className={cn(
										"inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-medium",
										FOLLOW_UP_STATUS_COLORS[
											task.followUpStatus
										],
									)}
								>
									{FOLLOW_UP_STATUS_LABELS[
										task.followUpStatus
									] ?? task.followUpStatus}
								</span>
							)}
						</div>
					);
				},
			},
			{
				id: "priority",
				header: "Priority",
				accessorFn: (row) => row.priority,
				enableSorting: true,
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					return (
						<span
							className={cn(
								"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
								TASK_PRIORITY_BG_COLORS[task.priority],
							)}
						>
							{TASK_PRIORITY_LABELS[task.priority] ??
								task.priority}
						</span>
					);
				},
			},
			{
				id: "dueDate",
				header: "Timeline",
				accessorFn: (row) => row.dueDate,
				enableSorting: true,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					const overdue = isOverdue(task.dueDate, task.status);
					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex cursor-default flex-col gap-0.5 leading-tight">
									{task.dueDate ? (
										<span
											className={cn(
												"inline-flex items-center gap-1 text-xs",
												overdue
													? "font-medium text-red-600 dark:text-red-400"
													: "text-foreground",
											)}
										>
											{overdue ? (
												<AlertTriangleIcon className="size-3" />
											) : (
												<ClockIcon className="size-3" />
											)}
											{formatRelativeDate(task.dueDate)}
										</span>
									) : (
										<span className="text-xs text-muted-foreground">
											No due date
										</span>
									)}
									{task.completedAt && (
										<span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
											<CheckCircle2Icon className="size-2.5" />
											{formatDate(task.completedAt)}
										</span>
									)}
								</div>
							</TooltipTrigger>
							<TooltipContent side="left" className="text-xs">
								<div className="space-y-0.5">
									<div>
										Created {formatDateTime(task.createdAt)}
									</div>
									{task.dueDate && (
										<div>
											Due {formatDate(task.dueDate)}
										</div>
									)}
									{task.completedAt && (
										<div>
											Completed{" "}
											{formatDateTime(task.completedAt)}
										</div>
									)}
								</div>
							</TooltipContent>
						</Tooltip>
					);
				},
			},
			{
				id: "actions",
				header: "Actions",
				enableSorting: false,
				meta: { className: "w-10" },
				cell: ({ row }) => {
					const task = row.original;
					return (
						<TaskRowActions
							organizationSlug={organizationSlug}
							taskId={task.id}
							status={task.status}
							assignedEmployeeIds={task.assignments.map(
								(a) => a.employee.id,
							)}
						/>
					);
				},
			},
		],
		[organizationSlug],
	);
}
