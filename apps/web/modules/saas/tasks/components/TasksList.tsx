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
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { TooltipProvider } from "@ui/components/tooltip";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

const routeApi = getRouteApi("/_saas/app/_org/$organizationSlug/tasks/");

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

import { useCustomersConnectivity } from "@saas/customers/client";
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
	// Status lives in the URL so the sidebar badge can open the approval queue.
	const { status: statusParam } = routeApi.useSearch();
	const navigate = routeApi.useNavigate();
	const status = statusParam ?? "all";
	const setStatus = (value: string) =>
		navigate({
			search: (prev) => ({
				...prev,
				status:
					value === "all"
						? undefined
						: (value as NonNullable<typeof statusParam>),
			}),
			replace: true,
		});
	const [priority, setPriority] = useState("all");
	const [category, setCategory] = useState("all");
	const [employeeId, setEmployeeId] = useState("all");
	const [page, setPage] = useState(1);
	// A status change from the URL (sidebar badge, back button) starts over
	// at page 1 like the in-page filters do.
	const [pageStatus, setPageStatus] = useState(statusParam);
	if (pageStatus !== statusParam) {
		setPageStatus(statusParam);
		setPage(1);
	}
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
		status: statusParam,
		priority: priority !== "all" ? (priority as "LOW") : undefined,
		category: category !== "all" ? (category as "GENERAL") : undefined,
		sources: ["MANUAL", "LEGACY"],
		employeeId: employeeId !== "all" ? employeeId : undefined,
		page,
		sortBy,
		sortOrder,
	});

	const hasFilters =
		search.trim() !== "" ||
		status !== "all" ||
		priority !== "all" ||
		category !== "all" ||
		employeeId !== "all";
	const clearFilters = () => {
		setSearch("");
		setStatus("all");
		setPriority("all");
		setCategory("all");
		setEmployeeId("all");
		resetPage();
	};

	const columns = useTaskColumns(organizationSlug);
	// Live online/offline for the customers on this page — the row data is
	// a snapshot, the dot should not be.
	const live = useCustomersConnectivity(
		tasks.flatMap((t) => (t.customer ? [t.customer.id] : [])),
	);
	const rows = tasks.map((t) => {
		const fresh = t.customer ? live.get(t.customer.id) : undefined;
		return fresh && t.customer
			? {
					...t,
					customer: {
						...t.customer,
						online: fresh.online,
						status: fresh.status,
					},
				}
			: t;
	});

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
				<TaskStats
					sources={["MANUAL", "LEGACY"]}
					selectedStatus={statusParam}
					onSelectStatus={(value) =>
						// Clicking the active card again clears the filter.
						setStatus(value === statusParam ? "all" : value)
					}
				/>
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
						onStatusChange={setStatus}
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
						data={rows}
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
									{!hasFilters
										? "No tasks yet"
										: search.trim()
											? `No tasks match “${search.trim()}”`
											: "No tasks match these filters"}
								</h3>
								<p className="mb-4 text-sm text-muted-foreground">
									{hasFilters
										? "Try another search term or clear the filters."
										: "Create your first task to get started."}
								</p>
								{hasFilters ? (
									<Button
										variant="outline"
										onClick={clearFilters}
									>
										Clear filters
									</Button>
								) : (
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
