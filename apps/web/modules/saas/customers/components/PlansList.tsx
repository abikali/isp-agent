"use client";

import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	ArchiveIcon,
	ArrowDownIcon,
	ArrowUpIcon,
	PackageIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useDeletePlan, usePlans } from "../hooks/use-plans";
import { CreatePlanDialog } from "./CreatePlanDialog";
import { EditPlanDialog } from "./EditPlanDialog";

type Plan = ReturnType<typeof usePlans>["plans"][number];

export function PlansList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [showArchived, setShowArchived] = useState(false);

	const { plans } = usePlans({
		search: debouncedSearch || undefined,
	});
	const deletePlan = useDeletePlan();
	const [showCreate, setShowCreate] = useState(false);
	const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

	const filtered = useMemo(() => {
		if (showArchived) {
			return plans;
		}
		return plans.filter((p) => !p.archived);
	}, [plans, showArchived]);

	const activeFilterCount = showArchived ? 1 : 0;

	function resetFilters() {
		setSearch("");
		setShowArchived(false);
	}

	const columns = useMemo<ColumnDef<Plan, unknown>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Plan",
				cell: ({ row }) => (
					<div>
						<p className="font-medium">{row.original.name}</p>
						{row.original.description && (
							<p className="text-xs text-muted-foreground line-clamp-1">
								{row.original.description}
							</p>
						)}
					</div>
				),
			},
			{
				id: "speed",
				accessorFn: (row) => row.downloadSpeed,
				header: "Speed",
				cell: ({ row }) => (
					<span className="tabular-nums text-sm flex items-center gap-3">
						<span className="flex items-center gap-1">
							<ArrowDownIcon className="size-3 text-muted-foreground" />
							{row.original.downloadSpeed}
						</span>
						<span className="flex items-center gap-1">
							<ArrowUpIcon className="size-3 text-muted-foreground" />
							{row.original.uploadSpeed}
						</span>
						<span className="text-xs text-muted-foreground">
							Mbps
						</span>
					</span>
				),
			},
			{
				accessorKey: "monthlyPrice",
				header: "Price",
				cell: ({ row }) => (
					<span className="font-mono tabular-nums text-sm">
						${row.original.monthlyPrice.toFixed(2)}
					</span>
				),
			},
			{
				id: "dealer",
				header: "Dealer",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.dealer?.name ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				id: "customers",
				accessorFn: (row) => row._count.customers,
				header: "Customers",
				cell: ({ row }) => (
					<span className="tabular-nums">
						{row.original._count.customers}
					</span>
				),
			},
			{
				id: "archived",
				header: "Status",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<StatusIndicator
						status={row.original.archived ? "inactive" : "active"}
						label={row.original.archived ? "Archived" : "Active"}
						size="sm"
					/>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => {
					const plan = row.original;
					return (
						<div className="flex gap-1">
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => setEditingPlan(plan)}
							>
								<PencilIcon className="size-4" />
								<span className="sr-only">Edit</span>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => {
									if (
										confirm(
											"Archive this plan? It won't be available for new customers.",
										)
									) {
										deletePlan.mutate({
											organizationId: plan.id,
											id: plan.id,
										});
									}
								}}
								disabled={plan._count.customers > 0}
							>
								<TrashIcon className="size-4" />
								<span className="sr-only">Archive</span>
							</Button>
						</div>
					);
				},
			},
		],
		[deletePlan],
	);

	return (
		<PageShell
			title="Service Plans"
			description="Manage the internet packages you offer to customers — speeds, pricing, and IPs."
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create plan
				</Button>
			}
		>
			<ContentCard>
				<ContentCardToolbar>
					<FilterBar
						bare
						searchPlaceholder="Search plans..."
						searchValue={search}
						onSearchChange={setSearch}
						activeFilterCount={activeFilterCount}
						onReset={resetFilters}
					>
						<Button
							variant={showArchived ? "primary" : "outline"}
							size="sm"
							onClick={() => setShowArchived(!showArchived)}
						>
							<ArchiveIcon className="mr-1.5 size-3.5" />
							Archived
						</Button>
					</FilterBar>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={filtered}
					pageSize={15}
					emptyState={
						plans.length === 0 && !activeFilterCount ? (
							<EmptyState
								icon={PackageIcon}
								title="No plans yet"
								description="Create your first service plan to assign to customers."
								action={
									<Button onClick={() => setShowCreate(true)}>
										<PlusIcon className="mr-2 size-4" />
										Create plan
									</Button>
								}
							/>
						) : (
							<EmptyState
								icon={PackageIcon}
								title="No results found"
								description="Try adjusting your search or filters."
							/>
						)
					}
				/>
			</ContentCard>

			<CreatePlanDialog open={showCreate} onOpenChange={setShowCreate} />
			{editingPlan && (
				<EditPlanDialog
					plan={editingPlan}
					open={!!editingPlan}
					onOpenChange={(open) => {
						if (!open) {
							setEditingPlan(null);
						}
					}}
				/>
			)}
		</PageShell>
	);
}
