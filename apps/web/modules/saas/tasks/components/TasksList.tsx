"use client";

import { displayName } from "@shared/lib/display-name";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
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
	ChevronLeftIcon,
	ChevronRightIcon,
	ClockIcon,
	MapPinIcon,
	PlusIcon,
	StickyNoteIcon,
	UserIcon,
} from "lucide-react";
import { useState } from "react";
import { useTasks } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_COLORS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskFilters } from "./TaskFilters";

function isOverdue(dueDate: string | Date | null, status: string): boolean {
	if (!dueDate || status === "COMPLETED" || status === "CANCELLED") {
		return false;
	}
	return new Date(dueDate) < new Date();
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
	return d.toLocaleDateString();
}

export function TasksList({ organizationSlug }: { organizationSlug: string }) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [priority, setPriority] = useState("all");
	const [category, setCategory] = useState("all");
	const [source, setSource] = useState("all");
	const [employeeId, setEmployeeId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const resetPage = () => setPage(1);

	const { tasks, total, totalPages, isLoading, isFetching } = useTasks({
		search: debouncedSearch || undefined,
		status: status !== "all" ? (status as "OPEN") : undefined,
		priority: priority !== "all" ? (priority as "LOW") : undefined,
		category: category !== "all" ? (category as "GENERAL") : undefined,
		source: source !== "all" ? (source as "MANUAL") : undefined,
		employeeId: employeeId !== "all" ? employeeId : undefined,
		page,
	});

	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Tasks</h1>
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Task
				</Button>
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
					source={source}
					onSourceChange={(v) => {
						setSource(v);
						resetPage();
					}}
					employeeId={employeeId}
					onEmployeeIdChange={(v) => {
						setEmployeeId(v);
						resetPage();
					}}
				/>
			</div>

			{isLoading ? (
				<div className="rounded-xl shadow-card p-8 text-center text-muted-foreground">
					Loading tasks...
				</div>
			) : tasks.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<h3 className="mb-1 text-lg font-medium">
						{total === 0 ? "No tasks yet" : "No results found"}
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
			) : (
				<TooltipProvider>
					<div
						className={cn(
							"rounded-xl shadow-card overflow-hidden transition-opacity",
							isFetching && "opacity-60",
						)}
					>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[40%]">
										Task
									</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Priority</TableHead>
									<TableHead className="hidden md:table-cell">
										Assignee
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Due Date
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{tasks.map((task) => {
									const overdue = isOverdue(
										task.dueDate,
										task.status,
									);
									return (
										<TableRow
											key={task.id}
											className={cn(
												"group",
												overdue &&
													"bg-red-50/50 dark:bg-red-950/20",
											)}
										>
											<TableCell>
												<div className="space-y-1">
													<div className="flex items-center gap-2">
														<span
															className={cn(
																"size-2 shrink-0 rounded-full",
																TASK_STATUS_COLORS[
																	task.status
																],
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
														{task.source ===
															"AI_ESCALATION" && (
															<Badge
																variant="secondary"
																className="gap-1 text-[10px] px-1.5 py-0"
															>
																<BotIcon className="size-3" />
																AI
															</Badge>
														)}
													</div>
													<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4 text-xs text-muted-foreground">
														{task.description && (
															<span className="line-clamp-1">
																{
																	task.description
																}
															</span>
														)}
													</div>
													<div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4 text-xs text-muted-foreground">
														<span className="inline-flex items-center gap-1">
															{
																TASK_CATEGORY_LABELS[
																	task
																		.category
																]
															}
														</span>
														{task.customer && (
															<span className="inline-flex items-center gap-1">
																<UserIcon className="size-3" />
																<Link
																	to="/app/$organizationSlug/customers/$customerId"
																	params={{
																		organizationSlug,
																		customerId:
																			task
																				.customer
																				.id,
																	}}
																	className="hover:underline"
																	preload="intent"
																>
																	{displayName(
																		task
																			.customer
																			.firstName,
																		task
																			.customer
																			.lastName,
																	)}
																</Link>
															</span>
														)}
														{task.station && (
															<span className="inline-flex items-center gap-1">
																<MapPinIcon className="size-3" />
																{
																	task.station
																		.name
																}
															</span>
														)}
														{task.notes && (
															<Tooltip>
																<TooltipTrigger
																	asChild
																>
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
																		{
																			task.notes
																		}
																	</p>
																</TooltipContent>
															</Tooltip>
														)}
													</div>
												</div>
											</TableCell>
											<TableCell>
												<span
													className={cn(
														"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
														TASK_STATUS_BG_COLORS[
															task.status
														],
													)}
												>
													{TASK_STATUS_LABELS[
														task.status
													] ?? task.status}
												</span>
											</TableCell>
											<TableCell>
												<span
													className={cn(
														"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
														TASK_PRIORITY_BG_COLORS[
															task.priority
														],
													)}
												>
													{TASK_PRIORITY_LABELS[
														task.priority
													] ?? task.priority}
												</span>
											</TableCell>
											<TableCell className="hidden md:table-cell">
												{task.assignments.length > 0 ? (
													<div className="flex items-center gap-1">
														{task.assignments
															.slice(0, 2)
															.map((a) => (
																<span
																	key={
																		a
																			.employee
																			.id
																	}
																	className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
																	title={
																		a
																			.employee
																			.name
																	}
																>
																	{a.employee.name
																		.split(
																			" ",
																		)
																		.map(
																			(
																				n,
																			) =>
																				n[0],
																		)
																		.join(
																			"",
																		)
																		.slice(
																			0,
																			2,
																		)
																		.toUpperCase()}
																</span>
															))}
														{task.assignments
															.length > 2 && (
															<span className="text-xs text-muted-foreground">
																+
																{task
																	.assignments
																	.length - 2}
															</span>
														)}
													</div>
												) : (
													<span className="text-xs text-muted-foreground">
														Unassigned
													</span>
												)}
											</TableCell>
											<TableCell className="hidden lg:table-cell">
												{task.dueDate ? (
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
														{formatRelativeDate(
															task.dueDate,
														)}
													</span>
												) : (
													<span className="text-xs text-muted-foreground">
														No due date
													</span>
												)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>

					{totalPages > 1 && (
						<div className="mt-4 flex items-center justify-between">
							<p className="text-sm text-muted-foreground">
								Showing {(page - 1) * 25 + 1}-
								{Math.min(page * 25, total)} of {total}
							</p>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setPage((p) => Math.max(1, p - 1))
									}
									disabled={page === 1}
								>
									<ChevronLeftIcon className="size-4" />
								</Button>
								<span className="text-sm">
									Page {page} of {totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setPage((p) =>
											Math.min(totalPages, p + 1),
										)
									}
									disabled={page === totalPages}
								>
									<ChevronRightIcon className="size-4" />
								</Button>
							</div>
						</div>
					)}
				</TooltipProvider>
			)}

			<CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
		</div>
	);
}
