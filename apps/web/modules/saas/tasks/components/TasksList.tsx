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
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useTasks } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_LABELS,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_LABELS,
} from "../lib/constants";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskFilters } from "./TaskFilters";

export function TasksList({ organizationSlug }: { organizationSlug: string }) {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
	const [priority, setPriority] = useState("all");
	const [category, setCategory] = useState("all");
	const [employeeId, setEmployeeId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const filters = {
		search: search || undefined,
		status:
			status !== "all"
				? (status as
						| "OPEN"
						| "IN_PROGRESS"
						| "ON_HOLD"
						| "COMPLETED"
						| "CANCELLED")
				: undefined,
		priority:
			priority !== "all"
				? (priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT")
				: undefined,
		category:
			category !== "all"
				? (category as
						| "INSTALLATION"
						| "MAINTENANCE"
						| "REPAIR"
						| "SUPPORT"
						| "BILLING"
						| "GENERAL")
				: undefined,
		employeeId: employeeId !== "all" ? employeeId : undefined,
		page,
	};

	const { tasks, total, totalPages } = useTasks(filters);

	function getStatusVariant(s: string) {
		switch (s) {
			case "OPEN":
				return "outline" as const;
			case "IN_PROGRESS":
				return "default" as const;
			case "ON_HOLD":
				return "secondary" as const;
			case "COMPLETED":
				return "default" as const;
			case "CANCELLED":
				return "destructive" as const;
			default:
				return "secondary" as const;
		}
	}

	function getPriorityVariant(p: string) {
		switch (p) {
			case "URGENT":
				return "destructive" as const;
			case "HIGH":
				return "default" as const;
			case "MEDIUM":
				return "secondary" as const;
			case "LOW":
				return "outline" as const;
			default:
				return "secondary" as const;
		}
	}

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
						setPage(1);
					}}
					status={status}
					onStatusChange={(v) => {
						setStatus(v);
						setPage(1);
					}}
					priority={priority}
					onPriorityChange={(v) => {
						setPriority(v);
						setPage(1);
					}}
					category={category}
					onCategoryChange={(v) => {
						setCategory(v);
						setPage(1);
					}}
					employeeId={employeeId}
					onEmployeeIdChange={(v) => {
						setEmployeeId(v);
						setPage(1);
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
										</TableCell>
										<TableCell>
											<Badge
												variant={getStatusVariant(
													task.status,
												)}
											>
												{TASK_STATUS_LABELS[
													task.status
												] ?? task.status}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge
												variant={getPriorityVariant(
													task.priority,
												)}
											>
												{TASK_PRIORITY_LABELS[
													task.priority
												] ?? task.priority}
											</Badge>
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
													-
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
