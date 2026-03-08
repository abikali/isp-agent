"use client";

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
	BotIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { useTasks } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskFilters } from "./TaskFilters";

const STATUS_VARIANTS: Record<
	string,
	"outline" | "default" | "secondary" | "destructive"
> = {
	OPEN: "outline",
	IN_PROGRESS: "default",
	ON_HOLD: "secondary",
	COMPLETED: "default",
	CANCELLED: "destructive",
};

const PRIORITY_VARIANTS: Record<
	string,
	"outline" | "default" | "secondary" | "destructive"
> = {
	URGENT: "destructive",
	HIGH: "default",
	MEDIUM: "secondary",
	LOW: "outline",
};

export function TasksList({ organizationSlug }: { organizationSlug: string }) {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
	const [priority, setPriority] = useState("all");
	const [category, setCategory] = useState("all");
	const [source, setSource] = useState("all");
	const [employeeId, setEmployeeId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const resetPage = () => setPage(1);

	const { tasks, total, totalPages } = useTasks({
		search: search || undefined,
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

			{tasks.length === 0 ? (
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
				<>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Title</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Priority</TableHead>
									<TableHead className="hidden md:table-cell">
										Customer
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Assignee(s)
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Due Date
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Category
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{tasks.map((task) => (
									<TableRow key={task.id}>
										<TableCell>
											<div className="flex items-center gap-2">
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
														className="gap-1 text-xs"
													>
														<BotIcon className="size-3" />
														AI
													</Badge>
												)}
											</div>
											{task.description && (
												<p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
													{task.description}
												</p>
											)}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													STATUS_VARIANTS[
														task.status
													] ?? "secondary"
												}
											>
												{TASK_STATUS_LABELS[
													task.status
												] ?? task.status}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge
												variant={
													PRIORITY_VARIANTS[
														task.priority
													] ?? "secondary"
												}
											>
												{TASK_PRIORITY_LABELS[
													task.priority
												] ?? task.priority}
											</Badge>
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{task.customer ? (
												<Link
													to="/app/$organizationSlug/customers/$customerId"
													params={{
														organizationSlug,
														customerId:
															task.customer.id,
													}}
													className="text-sm hover:underline"
													preload="intent"
												>
													{task.customer.fullName}
												</Link>
											) : (
												<span className="text-muted-foreground">
													—
												</span>
											)}
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{task.assignments.length > 0 ? (
												task.assignments
													.map((a) => a.employee.name)
													.join(", ")
											) : (
												<span className="text-muted-foreground">
													Unassigned
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell text-sm">
											{task.dueDate ? (
												new Date(
													task.dueDate,
												).toLocaleDateString()
											) : (
												<span className="text-muted-foreground">
													—
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell">
											{TASK_CATEGORY_LABELS[
												task.category
											] ?? task.category}
										</TableCell>
									</TableRow>
								))}
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
				</>
			)}

			<CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
		</div>
	);
}
