"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	PencilIcon,
	PlusIcon,
	RadioTowerIcon,
	TrashIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useDeleteStation, useStations } from "../hooks/use-stations";
import {
	STATION_STATUS_LABELS,
	STATION_STATUS_OPTIONS,
} from "../lib/constants";
import { CreateStationDialog } from "./CreateStationDialog";
import { EditStationDialog } from "./EditStationDialog";

type Station = ReturnType<typeof useStations>["stations"][number];

const statusIndicatorMap: Record<string, "active" | "inactive" | "pending"> = {
	ACTIVE: "active",
	MAINTENANCE: "pending",
	OFFLINE: "inactive",
};

export function StationsList() {
	const deleteStation = useDeleteStation();
	const [showCreate, setShowCreate] = useState(false);
	const [editingStation, setEditingStation] = useState<Station | null>(null);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [statusFilter, setStatusFilter] = useState("");
	const [onlineFilter, setOnlineFilter] = useState("");
	const { stations } = useStations({
		search: debouncedSearch || undefined,
		status:
			(statusFilter as "ACTIVE" | "MAINTENANCE" | "OFFLINE") || undefined,
		online:
			onlineFilter === "online"
				? true
				: onlineFilter === "offline"
					? false
					: undefined,
	});

	const activeFilterCount = (statusFilter ? 1 : 0) + (onlineFilter ? 1 : 0);

	function resetFilters() {
		setSearch("");
		setStatusFilter("");
		setOnlineFilter("");
	}

	const columns = useMemo<ColumnDef<Station, unknown>[]>(
		() => [
			{
				id: "statusIcon",
				enableSorting: false,
				meta: { className: "w-10 pr-0" },
				cell: ({ row }) => (
					<StatusIndicator
						status={
							statusIndicatorMap[row.original.status] ??
							"inactive"
						}
						label=""
						size="sm"
					/>
				),
			},
			{
				accessorKey: "name",
				header: "Station",
				cell: ({ row }) => (
					<div>
						<p className="font-medium">{row.original.name}</p>
						<p className="text-xs text-muted-foreground">
							{STATION_STATUS_LABELS[row.original.status] ??
								row.original.status}
						</p>
					</div>
				),
			},
			{
				id: "address",
				accessorKey: "address",
				header: "Address",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.address ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				id: "host",
				header: "Host",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm font-mono">
						{row.original.host ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				id: "online",
				header: "Online",
				enableSorting: false,
				cell: ({ row }) =>
					row.original.online ? (
						<Badge
							variant="outline"
							className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30"
						>
							<WifiIcon className="mr-1 size-3" />
							Online
						</Badge>
					) : (
						<Badge
							variant="outline"
							className="text-muted-foreground"
						>
							<WifiOffIcon className="mr-1 size-3" />
							Offline
						</Badge>
					),
			},
			{
				id: "dealers",
				header: "Dealers",
				enableSorting: false,
				cell: ({ row }) => {
					const stationDealers = row.original.dealers;
					if (!stationDealers || stationDealers.length === 0) {
						return (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						);
					}
					if (stationDealers.length === 1) {
						return (
							<span className="text-sm">
								{stationDealers[0]?.name}
							</span>
						);
					}
					return (
						<div className="flex items-center gap-1">
							<span className="text-sm">
								{stationDealers[0]?.name}
							</span>
							<Badge
								variant="secondary"
								className="text-[10px] px-1.5 py-0"
							>
								+{stationDealers.length - 1}
							</Badge>
						</div>
					);
				},
			},
			{
				id: "customers",
				accessorFn: (row) => row._count.customers,
				header: "Customers",
				cell: ({ row }) => (
					<span className="tabular-nums">
						{row.original._count.customers}
						{row.original.capacity ? (
							<span className="text-xs text-muted-foreground">
								{" "}
								/ {row.original.capacity}
							</span>
						) : null}
					</span>
				),
			},
			{
				id: "employees",
				accessorFn: (row) => row._count.employees,
				header: "Employees",
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="tabular-nums">
						{row.original._count.employees}
					</span>
				),
			},
			{
				id: "accessPoints",
				accessorFn: (row) => row._count.accessPoints,
				header: "APs",
				meta: { className: "hidden xl:table-cell" },
				cell: ({ row }) => (
					<span className="tabular-nums">
						{row.original._count.accessPoints}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => {
					const station = row.original;
					return (
						<div className="flex gap-1">
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => setEditingStation(station)}
							>
								<PencilIcon className="size-4" />
								<span className="sr-only">Edit</span>
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => {
									if (confirm("Delete this station?")) {
										deleteStation.mutate({
											organizationId: station.id,
											id: station.id,
										});
									}
								}}
								disabled={station._count.customers > 0}
							>
								<TrashIcon className="size-4" />
								<span className="sr-only">Delete</span>
							</Button>
						</div>
					);
				},
			},
		],
		[deleteStation],
	);

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
				searchPlaceholder="Search by name, address, or host..."
				searchValue={search}
				onSearchChange={setSearch}
				activeFilterCount={activeFilterCount}
				onReset={resetFilters}
			>
				<Select
					value={statusFilter || "all"}
					onValueChange={(val) =>
						setStatusFilter(val === "all" ? "" : val)
					}
				>
					<SelectTrigger className="w-[150px]">
						<SelectValue placeholder="All Status" />
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
				<Select
					value={onlineFilter || "all"}
					onValueChange={(val) =>
						setOnlineFilter(val === "all" ? "" : val)
					}
				>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Connectivity" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All</SelectItem>
						<SelectItem value="online">Online</SelectItem>
						<SelectItem value="offline">Offline</SelectItem>
					</SelectContent>
				</Select>
			</FilterBar>

			<DataTable
				columns={columns}
				data={stations}
				pageSize={15}
				emptyState={
					stations.length === 0 &&
					!activeFilterCount &&
					!debouncedSearch ? (
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
					) : (
						<EmptyState
							icon={RadioTowerIcon}
							title="No results found"
							description="Try adjusting your search or filters."
						/>
					)
				}
			/>

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
