"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { PageShell } from "@shared/components/PageShell";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { formatDateTime } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
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
	BotIcon,
	ClockIcon,
	MessageSquareIcon,
	UserIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

const ESCALATION_SORT_BY_MAP = {
	status: "status",
	priority: "priority",
	escalated: "createdAt",
} as const satisfies Record<
	string,
	"title" | "createdAt" | "dueDate" | "priority" | "status"
>;

import { useTasks } from "../hooks/use-tasks";
import {
	FOLLOW_UP_STATUS_COLORS,
	FOLLOW_UP_STATUS_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { isOverdue, timeAgo } from "../lib/task-utils";
import { EscalationFilters } from "./EscalationFilters";
import { TaskStats } from "./TaskStats";
import { TaskStatsSkeleton } from "./TaskStatsSkeleton";

type EscalationItem = ReturnType<typeof useTasks>["tasks"][number];

function useEscalationColumns(organizationSlug: string) {
	return useMemo<ColumnDef<EscalationItem, unknown>[]>(
		() => [
			{
				id: "escalation",
				header: "Escalation",
				enableSorting: false,
				meta: { className: "w-full sm:w-[35%]" },
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
									to="/app/$organizationSlug/escalations/$taskId"
									params={{
										organizationSlug,
										taskId: task.id,
									}}
									className="font-medium hover:underline"
									preload="intent"
								>
									{task.title}
								</Link>
							</div>
							{task.description && (
								<p className="line-clamp-1 pl-4 text-xs text-muted-foreground">
									{task.description}
								</p>
							)}
							{task.conversation && (
								<div className="flex items-center gap-1 pl-4 text-xs text-muted-foreground">
									<MessageSquareIcon className="size-3" />
									<span>
										via {task.conversation.agent.name}
									</span>
								</div>
							)}
						</div>
					);
				},
			},
			{
				id: "contact",
				header: "Contact / Customer",
				enableSorting: false,
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					return (
						<div className="space-y-0.5">
							{task.conversation?.contactName && (
								<div className="flex items-center gap-1 text-sm">
									<BotIcon className="size-3 text-muted-foreground" />
									<span>{task.conversation.contactName}</span>
								</div>
							)}
							{task.customer && (
								<div className="flex items-center gap-1 text-xs text-muted-foreground">
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
								</div>
							)}
							{!task.conversation?.contactName &&
								!task.customer && (
									<span className="text-xs text-muted-foreground">
										Unknown
									</span>
								)}
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
				meta: { className: "hidden md:table-cell" },
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
				id: "followUp",
				header: "Follow-up",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					if (task.followUpStatus) {
						return (
							<span
								className={cn(
									"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
									FOLLOW_UP_STATUS_COLORS[
										task.followUpStatus
									] ?? "",
								)}
							>
								{FOLLOW_UP_STATUS_LABELS[task.followUpStatus] ??
									task.followUpStatus}
							</span>
						);
					}
					return (
						<span className="text-xs text-muted-foreground">
							Not started
						</span>
					);
				},
			},
			{
				id: "escalated",
				header: "Escalated",
				accessorFn: (row) => row.createdAt,
				enableSorting: true,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => {
					const task = row.original;
					const overdue = isOverdue(task.dueDate, task.status);
					return (
						<Tooltip>
							<TooltipTrigger asChild>
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
									{!overdue && (
										<ClockIcon className="size-3" />
									)}
									{timeAgo(task.createdAt)}
								</span>
							</TooltipTrigger>
							<TooltipContent>
								{formatDateTime(task.createdAt)}
							</TooltipContent>
						</Tooltip>
					);
				},
			},
		],
		[organizationSlug],
	);
}

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/pagination slices; a reducer would add ceremony without grouping related transitions
export function EscalationsList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [priority, setPriority] = useState("all");
	const [followUp, setFollowUp] = useState("all");
	const [page, setPage] = useState(1);

	const resetPage = () => setPage(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		ESCALATION_SORT_BY_MAP,
		resetPage,
	);

	const { tasks, total, isLoading, isFetching } = useTasks({
		search: debouncedSearch || undefined,
		status: status !== "all" ? (status as "OPEN") : undefined,
		priority: priority !== "all" ? (priority as "LOW") : undefined,
		followUpStatus: followUp !== "all" ? followUp : undefined,
		sources: ["AI_ESCALATION"],
		page,
		sortBy,
		sortOrder,
	});

	const columns = useEscalationColumns(organizationSlug);

	return (
		<PageShell
			title="AI Escalations"
			description="Tasks created by AI agents that need human attention"
		>
			<AsyncBoundary fallback={<TaskStatsSkeleton />}>
				<TaskStats sources={["AI_ESCALATION"]} />
			</AsyncBoundary>

			<ContentCard>
				<ContentCardToolbar>
					<EscalationFilters
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
						followUp={followUp}
						onFollowUpChange={(v) => {
							setFollowUp(v);
							resetPage();
						}}
					/>
				</ContentCardToolbar>

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
								<BotIcon className="mb-3 size-10 text-muted-foreground/50" />
								<h3 className="mb-1 text-lg font-medium">
									{total === 0
										? "No AI escalations yet"
										: "No results found"}
								</h3>
								<p className="text-sm text-muted-foreground">
									{total === 0
										? "Escalations will appear here when AI agents need human help."
										: "Try adjusting your filters or search term."}
								</p>
							</div>
						}
					/>
				</TooltipProvider>
			</ContentCard>
		</PageShell>
	);
}
