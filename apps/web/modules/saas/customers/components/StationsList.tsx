"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
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
	PencilIcon,
	PlusIcon,
	RadioTowerIcon,
	TrashIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useDeleteStation, useStations } from "../hooks/use-stations";
import {
	STATION_STATUS_LABELS,
	STATION_STATUS_OPTIONS,
} from "../lib/constants";
import { CreateStationDialog } from "./CreateStationDialog";
import { EditStationDialog } from "./EditStationDialog";

type SortField = "name" | "status" | "customers" | "employees";
type SortDir = "asc" | "desc";

const statusIndicatorMap: Record<string, "active" | "inactive" | "pending"> = {
	ACTIVE: "active",
	MAINTENANCE: "pending",
	OFFLINE: "inactive",
};

const PAGE_SIZE = 15;

export function StationsList() {
	const { stations } = useStations();
	const deleteStation = useDeleteStation();
	const [showCreate, setShowCreate] = useState(false);
	const [editingStation, setEditingStation] = useState<
		(typeof stations)[number] | null
	>(null);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [statusFilter, setStatusFilter] = useState("all");
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
		let result = [...stations];

		if (debouncedSearch) {
			const q = debouncedSearch.toLowerCase();
			result = result.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.address?.toLowerCase().includes(q),
			);
		}

		if (statusFilter !== "all") {
			result = result.filter((s) => s.status === statusFilter);
		}

		result.sort((a, b) => {
			let cmp = 0;
			switch (sortField) {
				case "name":
					cmp = a.name.localeCompare(b.name);
					break;
				case "status":
					cmp = a.status.localeCompare(b.status);
					break;
				case "customers":
					cmp = a._count.customers - b._count.customers;
					break;
				case "employees":
					cmp = a._count.employees - b._count.employees;
					break;
			}
			return sortDir === "asc" ? cmp : -cmp;
		});

		return result;
	}, [stations, debouncedSearch, statusFilter, sortField, sortDir]);

	const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
	const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const activeCount = statusFilter !== "all" ? 1 : 0;

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
			title="Stations"
			description="Manage network access points and towers"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Station
				</Button>
			}
		>
			<FilterBar
				searchPlaceholder="Search stations..."
				searchValue={search}
				onSearchChange={(v) => {
					setSearch(v);
					setPage(1);
				}}
				activeFilterCount={activeCount}
				onReset={() => {
					setStatusFilter("all");
					setPage(1);
				}}
			>
				<Select
					value={statusFilter}
					onValueChange={(v) => {
						setStatusFilter(v);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Status</SelectItem>
						{STATION_STATUS_OPTIONS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</FilterBar>

			{stations.length === 0 ? (
				<EmptyState
					icon={RadioTowerIcon}
					title="No stations yet"
					description="Create your first station to organize customer connections."
					action={
						<Button onClick={() => setShowCreate(true)}>
							<PlusIcon className="mr-2 size-4" />
							Create Station
						</Button>
					}
				/>
			) : filtered.length === 0 ? (
				<EmptyState
					icon={RadioTowerIcon}
					title="No results found"
					description="Try adjusting your search or filters."
				/>
			) : (
				<>
					<div className="rounded-xl shadow-card overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10" />
									<TableHead>
										<button
											type="button"
											className="inline-flex items-center font-medium"
											onClick={() => toggleSort("name")}
										>
											Station <SortIcon field="name" />
										</button>
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Address
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
									<TableHead className="hidden lg:table-cell">
										<button
											type="button"
											className="inline-flex items-center font-medium"
											onClick={() =>
												toggleSort("employees")
											}
										>
											Employees{" "}
											<SortIcon field="employees" />
										</button>
									</TableHead>
									<TableHead className="w-24" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{paginated.map((station) => (
									<TableRow
										key={station.id}
										className="hover:bg-muted/30 transition-colors"
									>
										<TableCell className="w-10 pr-0">
											<StatusIndicator
												status={
													statusIndicatorMap[
														station.status
													] ?? "inactive"
												}
												label=""
												size="sm"
											/>
										</TableCell>
										<TableCell>
											<div>
												<p className="font-medium">
													{station.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{STATION_STATUS_LABELS[
														station.status
													] ?? station.status}
												</p>
											</div>
										</TableCell>
										<TableCell className="hidden md:table-cell text-sm">
											{station.address ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="tabular-nums">
											{station._count.customers}
											{station.capacity ? (
												<span className="text-xs text-muted-foreground">
													{" "}
													/ {station.capacity}
												</span>
											) : null}
										</TableCell>
										<TableCell className="hidden lg:table-cell tabular-nums">
											{station._count.employees}
										</TableCell>
										<TableCell>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
													onClick={() =>
														setEditingStation(
															station,
														)
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
																"Delete this station?",
															)
														) {
															deleteStation.mutate(
																{
																	organizationId:
																		station.id,
																	id: station.id,
																},
															);
														}
													}}
													disabled={
														station._count
															.customers > 0
													}
												>
													<TrashIcon className="size-4" />
													<span className="sr-only">
														Delete
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
								{filtered.length} station
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

			<CreateStationDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			{editingStation && (
				<EditStationDialog
					station={editingStation}
					open={!!editingStation}
					onOpenChange={(open) => {
						if (!open) {
							setEditingStation(null);
						}
					}}
				/>
			)}
		</PageShell>
	);
}
