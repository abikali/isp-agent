"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	ClockIcon,
	MapPinIcon,
	PlusIcon,
	StickyNoteIcon,
	UserIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

const TASK_SORT_BY_MAP = {
	title: "title",
	status: "status",
	priority: "priority",
	dueDate: "dueDate",
} as const satisfies Record<
	string,
	"title" | "createdAt" | "dueDate" | "priority" | "status"
>;

import { useTasks } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { isOverdue } from "../lib/task-utils";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskFilters } from "./TaskFilters";
import { TaskStats } from "./TaskStats";
import { TaskStatsSkeleton } from "./TaskStatsSkeleton";

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
	return d.toLocaleDateString();
}

type TaskItem = ReturnType<typeof useTasks>["tasks"][number];

function useTaskColumns(organizationSlug: string) {
	return useMemo<ColumnDef<TaskItem, unknown>[]>(
		() => [
			{
				id: "title",
				header: "Task",
				accessorFn: (row) => row.title,
				enableSorting: true,
				meta: { className: "w-full sm:w-[40%]" },
				cell: ({ row }) => {
					const task = row.original;
					return (
						<div className="space-y-1">
							<div className="flex items-center gap-2">
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
								{task.source === "LEGACY" && (
									<Badge
										variant="outline"
										className="text-[10px] px-1.5 py-0"
									>
										Legacy
									</Badge>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4 text-xs text-muted-foreground">
								{task.description && (
									<span className="line-clamp-1">
										{task.description}
									</span>
								)}
							</div>
							<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4 text-xs text-muted-foreground">
								<span className="inline-flex items-center gap-1">
									{TASK_CATEGORY_LABELS[task.category]}
								</span>
								{task.customer && (
									<span className="inline-flex items-center gap-1">
										<UserIcon className="size-3" />
										<Link
											to="/app/$organizationSlug/customers/$customerId"
											params={{
												organizationSlug,
												customerId: task.customer.id,
											}}
											className="hover:underline"
											preload="intent"
										>
											{displayName(
												task.customer.firstName,
												task.customer.lastName,
											)}
										</Link>
									</span>
								)}
								{task.station && (
									<span className="inline-flex items-center gap-1">
										<MapPinIcon className="size-3" />
										{task.station.name}
									</span>
								)}
								{task.notes && (
									<Tooltip>
										<TooltipTrigger asChild>
											<span className="inline-flex items-center gap-1 cursor-default">
												<StickyNoteIcon className="size-3" />
												Note
											</span>
										</TooltipTrigger>
										<TooltipContent
											side="bottom"
											className="max-w-xs"
										>
											<p className="text-xs line-clamp-3">
												{task.notes}
											</p>
										</TooltipContent>
									</Tooltip>
								)}
							</div>
						</div>
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
						<span
							className={cn(
								"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
								TASK_STATUS_BG_COLORS[task.status],
							)}
						>
							{TASK_STATUS_LABELS[task.status] ?? task.status}
						</span>
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
				id: "assignee",
				header: "Assignee",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					if (task.assignments.length > 0) {
						return (
							<div className="flex items-center gap-1">
								{task.assignments.slice(0, 2).map((a) => (
									<span
										key={a.employee.id}
										className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
										title={a.employee.name}
									>
										{a.employee.name
											.split(" ")
											.map((n) => n[0])
											.join("")
											.slice(0, 2)
											.toUpperCase()}
									</span>
								))}
								{task.assignments.length > 2 && (
									<span className="text-xs text-muted-foreground">
										+{task.assignments.length - 2}
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
				id: "dueDate",
				header: "Due Date",
				accessorFn: (row) => row.dueDate,
				enableSorting: true,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					const overdue = isOverdue(task.dueDate, task.status);
					if (task.dueDate) {
						return (
							<span
								className={cn(
									"inline-flex items-center gap-1 text-xs",
									overdue
										? "font-medium text-red-600 dark:text-red-400"
										: "text-muted-foreground",
								)}
							>
								{overdue && (
									<AlertTriangleIcon className="size-3" />
								)}
								{!overdue && <ClockIcon className="size-3" />}
								{formatRelativeDate(task.dueDate)}
							</span>
						);
					}
					return (
						<span className="text-xs text-muted-foreground">
							No due date
						</span>
					);
				},
			},
		],
		[organizationSlug],
	);
}

export function TasksList({ organizationSlug }: { organizationSlug: string }) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [priority, setPriority] = useState("all");
	const [category, setCategory] = useState("all");
	const [employeeId, setEmployeeId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const resetPage = () => setPage(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		TASK_SORT_BY_MAP,
		resetPage,
	);

	const { tasks, total, isLoading, isFetching } = useTasks({
		search: debouncedSearch || undefined,
		status: status !== "all" ? (status as "OPEN") : undefined,
		priority: priority !== "all" ? (priority as "LOW") : undefined,
		category: category !== "all" ? (category as "GENERAL") : undefined,
		sources: ["MANUAL", "LEGACY"],
		employeeId: employeeId !== "all" ? employeeId : undefined,
		page,
		sortBy,
		sortOrder,
	});

	const columns = useTaskColumns(organizationSlug);

	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Tasks</h1>
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Task
				</Button>
			</div>

			<div className="mb-6">
				<AsyncBoundary fallback={<TaskStatsSkeleton />}>
					<TaskStats sources={["MANUAL", "LEGACY"]} />
				</AsyncBoundary>
			</div>

			<div className="mb-4">
				<TaskFilters
					search={search}
					onSearchChange={(v) => {
						setSearch(v);
						resetPage();
					}}
					status={status}
					onStatusChange={(v) => {
						setStatus(v);
						resetPage();
					}}
					priority={priority}
					onPriorityChange={(v) => {
						setPriority(v);
						resetPage();
					}}
					category={category}
					onCategoryChange={(v) => {
						setCategory(v);
						resetPage();
					}}
					employeeId={employeeId}
					onEmployeeIdChange={(v) => {
						setEmployeeId(v);
						resetPage();
					}}
				/>
			</div>

			<TooltipProvider>
				<DataTable
					columns={columns}
					data={tasks}
					isLoading={isLoading}
					isFetching={isFetching}
					sorting={sorting}
					onSortingChange={onSortingChange}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: 25,
						onPageChange: setPage,
					}}
					emptyState={
						<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
							<h3 className="mb-1 text-lg font-medium">
								{total === 0
									? "No tasks yet"
									: "No results found"}
							</h3>
							<p className="mb-4 text-sm text-muted-foreground">
								{total === 0
									? "Create your first task to get started."
									: "Try adjusting your filters or search term."}
							</p>
							{total === 0 && (
								<Button onClick={() => setShowCreate(true)}>
									<PlusIcon className="mr-2 size-4" />
									Create Task
								</Button>
							)}
						</div>
					}
				/>
			</TooltipProvider>

			<CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
		</div>
	);
}
