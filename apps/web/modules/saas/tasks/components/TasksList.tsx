"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { PageShell } from "@shared/components/PageShell";
import { TableColumnsToggle } from "@shared/components/TableColumnsToggle";
import { usePersistedColumnVisibility } from "@shared/hooks/use-persisted-column-visibility";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { TooltipProvider } from "@ui/components/tooltip";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

const TASK_SORT_BY_MAP = {
	title: "title",
	status: "status",
	priority: "priority",
	dueDate: "dueDate",
	started: "createdAt",
} as const satisfies Record<
	string,
	"title" | "createdAt" | "dueDate" | "priority" | "status"
>;

import { useTasks } from "../hooks/use-tasks";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskFilters } from "./TaskFilters";
import { TaskRowDetails } from "./TaskRowDetails";
import { TaskStats } from "./TaskStats";
import { TaskStatsSkeleton } from "./TaskStatsSkeleton";
import { TASK_TOGGLEABLE_COLUMNS, useTaskColumns } from "./task-columns";
import { UninstalledItemsReview } from "./UninstalledItemsReview";
import { WorkerWorkloadCards } from "./WorkerWorkloadCards";

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/pagination slices; a reducer would add ceremony without grouping related transitions
export function TasksList({ organizationSlug }: { organizationSlug: string }) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [priority, setPriority] = useState("all");
	const [category, setCategory] = useState("all");
	const [employeeId, setEmployeeId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [columnVisibility, setColumnVisibility] =
		usePersistedColumnVisibility("tasks");

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
		<PageShell
			title="Tasks"
			description="Track and assign work across your team"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="size-4" />
					New task
				</Button>
			}
		>
			<AsyncBoundary fallback={<TaskStatsSkeleton />}>
				<TaskStats sources={["MANUAL", "LEGACY"]} />
			</AsyncBoundary>

			<AsyncBoundary fallback={null}>
				<WorkerWorkloadCards />
			</AsyncBoundary>

			<UninstalledItemsReview />

			<ContentCard>
				<ContentCardToolbar>
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
					<TableColumnsToggle
						columns={TASK_TOGGLEABLE_COLUMNS}
						value={columnVisibility}
						onChange={setColumnVisibility}
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
						columnVisibility={columnVisibility}
						onColumnVisibilityChange={setColumnVisibility}
						getRowId={(row) => row.id}
						renderSubRow={(row) => (
							<TaskRowDetails
								task={row.original}
								organizationSlug={organizationSlug}
							/>
						)}
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
			</ContentCard>

			<CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
		</PageShell>
	);
}
