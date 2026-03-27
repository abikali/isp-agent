"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useDebouncedValue } from "@tanstack/react-pacer";
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
	ArrowDownIcon,
	ArrowUpDownIcon,
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

type SortField = "name" | "monthlyPrice" | "downloadSpeed" | "customers";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 15;

export function PlansList() {
	const { plans } = usePlans();
	const deletePlan = useDeletePlan();
	const [showCreate, setShowCreate] = useState(false);
	const [editingPlan, setEditingPlan] = useState<
		(typeof plans)[number] | null
	>(null);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [sortField, setSortField] = useState<SortField>("name");
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [page, setPage] = useState(1);

	function toggleSort(field: SortField) {
		if (sortField === field) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortField(field);
			setSortDir("asc");
		}
		setPage(1);
	}

	const filtered = useMemo(() => {
		let result = [...plans];

		if (debouncedSearch) {
			const q = debouncedSearch.toLowerCase();
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes(q) ||
					p.description?.toLowerCase().includes(q),
			);
		}

		result.sort((a, b) => {
			let cmp = 0;
			switch (sortField) {
				case "name":
					cmp = a.name.localeCompare(b.name);
					break;
				case "monthlyPrice":
					cmp = a.monthlyPrice - b.monthlyPrice;
					break;
				case "downloadSpeed":
					cmp = a.downloadSpeed - b.downloadSpeed;
					break;
				case "customers":
					cmp = a._count.customers - b._count.customers;
					break;
			}
			return sortDir === "asc" ? cmp : -cmp;
		});

		return result;
	}, [plans, debouncedSearch, sortField, sortDir]);

	const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
	const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	function SortIcon({ field }: { field: SortField }) {
		if (sortField !== field) {
			return <ArrowUpDownIcon className="ml-1 size-3 opacity-30" />;
		}
		return sortDir === "asc" ? (
			<ArrowUpIcon className="ml-1 size-3" />
		) : (
			<ArrowDownIcon className="ml-1 size-3" />
		);
	}

	return (
		<PageShell
			title="Service Plans"
			description="Manage internet packages for your customers"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Plan
				</Button>
			}
		>
			<FilterBar
				searchPlaceholder="Search plans..."
				searchValue={search}
				onSearchChange={(v) => {
					setSearch(v);
					setPage(1);
				}}
			/>

			{plans.length === 0 ? (
				<EmptyState
					icon={PackageIcon}
					title="No plans yet"
					description="Create your first service plan to assign to customers."
					action={
						<Button onClick={() => setShowCreate(true)}>
							<PlusIcon className="mr-2 size-4" />
							Create Plan
						</Button>
					}
				/>
			) : filtered.length === 0 ? (
				<EmptyState
					icon={PackageIcon}
					title="No results found"
					description="Try adjusting your search term."
				/>
			) : (
				<>
					<div className="rounded-xl shadow-card overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										<button
											type="button"
											className="inline-flex items-center font-medium"
											onClick={() => toggleSort("name")}
										>
											Plan <SortIcon field="name" />
										</button>
									</TableHead>
									<TableHead>
										<button
											type="button"
											className="inline-flex items-center font-medium"
											onClick={() =>
												toggleSort("downloadSpeed")
											}
										>
											Speed{" "}
											<SortIcon field="downloadSpeed" />
										</button>
									</TableHead>
									<TableHead>
										<button
											type="button"
											className="inline-flex items-center font-medium"
											onClick={() =>
												toggleSort("monthlyPrice")
											}
										>
											Price{" "}
											<SortIcon field="monthlyPrice" />
										</button>
									</TableHead>
									<TableHead>
										<button
											type="button"
											className="inline-flex items-center font-medium"
											onClick={() =>
												toggleSort("customers")
											}
										>
											Customers{" "}
											<SortIcon field="customers" />
										</button>
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Archived
									</TableHead>
									<TableHead className="w-24" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{paginated.map((plan) => (
									<TableRow
										key={plan.id}
										className="hover:bg-muted/30 transition-colors"
									>
										<TableCell>
											<div>
												<p className="font-medium">
													{plan.name}
												</p>
												{plan.description && (
													<p className="text-xs text-muted-foreground line-clamp-1">
														{plan.description}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell className="tabular-nums text-sm">
											<span className="flex items-center gap-3">
												<span className="flex items-center gap-1">
													<ArrowDownIcon className="size-3 text-muted-foreground" />
													{plan.downloadSpeed}
												</span>
												<span className="flex items-center gap-1">
													<ArrowUpIcon className="size-3 text-muted-foreground" />
													{plan.uploadSpeed}
												</span>
												<span className="text-xs text-muted-foreground">
													Mbps
												</span>
											</span>
										</TableCell>
										<TableCell className="font-mono tabular-nums text-sm">
											${plan.monthlyPrice.toFixed(2)}
										</TableCell>
										<TableCell className="tabular-nums">
											{plan._count.customers}
										</TableCell>
										<TableCell className="hidden md:table-cell">
											<StatusIndicator
												status={
													plan.archived
														? "inactive"
														: "active"
												}
												label={
													plan.archived
														? "Archived"
														: "Active"
												}
												size="sm"
											/>
										</TableCell>
										<TableCell>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={() =>
														setEditingPlan(plan)
													}
												>
													<PencilIcon className="size-4" />
													<span className="sr-only">
														Edit
													</span>
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
																organizationId:
																	plan.id,
																id: plan.id,
															});
														}
													}}
													disabled={
														plan._count.customers >
														0
													}
												>
													<TrashIcon className="size-4" />
													<span className="sr-only">
														Archive
													</span>
												</Button>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{totalPages > 1 && (
						<div className="mt-4 flex items-center justify-between">
							<p className="text-sm text-muted-foreground">
								{filtered.length} plan
								{filtered.length !== 1 ? "s" : ""} total
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
									Previous
								</Button>
								<span className="text-sm tabular-nums text-muted-foreground">
									{page} / {totalPages}
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
									Next
								</Button>
							</div>
						</div>
					)}
				</>
			)}

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
