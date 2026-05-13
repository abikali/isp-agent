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
import { Badge } from "@ui/components/badge";
import { DataTable } from "@ui/components/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { RadioTowerIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useStations } from "../hooks/use-stations";

type Station = ReturnType<typeof useStations>["stations"][number];

export function StationsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [onlineFilter, setOnlineFilter] = useState("");
	const { stations } = useStations({
		search: debouncedSearch || undefined,
		online:
			onlineFilter === "online"
				? true
				: onlineFilter === "offline"
					? false
					: undefined,
	});

	const activeFilterCount = onlineFilter ? 1 : 0;

	function resetFilters() {
		setSearch("");
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
						status={row.original.online ? "active" : "inactive"}
						label=""
						size="sm"
					/>
				),
			},
			{
				accessorKey: "name",
				header: "Station",
				cell: ({ row }) => (
					<p className="font-medium">{row.original.name}</p>
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
		],
		[],
	);

	return (
		<PageShell
			title="Stations"
			description="Network stations synced from iRadius"
		>
			<ContentCard>
				<ContentCardToolbar>
					<FilterBar
						bare
						searchPlaceholder="Search by name, address, or host..."
						searchValue={search}
						onSearchChange={setSearch}
						activeFilterCount={activeFilterCount}
						onReset={resetFilters}
					>
						<Select
							value={onlineFilter || "all"}
							onValueChange={(val) =>
								setOnlineFilter(val === "all" ? "" : val)
							}
						>
							<SelectTrigger className="w-full sm:w-[140px]">
								<SelectValue placeholder="Connectivity" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All</SelectItem>
								<SelectItem value="online">Online</SelectItem>
								<SelectItem value="offline">Offline</SelectItem>
							</SelectContent>
						</Select>
					</FilterBar>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={stations}
					pageSize={15}
					emptyState={
						<EmptyState
							icon={RadioTowerIcon}
							title={
								stations.length === 0 &&
								!activeFilterCount &&
								!debouncedSearch
									? "No stations yet"
									: "No results found"
							}
							description={
								stations.length === 0 &&
								!activeFilterCount &&
								!debouncedSearch
									? "Stations will appear here after syncing from iRadius."
									: "Try adjusting your search or filters."
							}
						/>
					}
				/>
			</ContentCard>
		</PageShell>
	);
}
