"use client";

import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Combobox } from "@ui/components/combobox";
import { DataTable } from "@ui/components/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { UsersIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useAccessPoints } from "../hooks/use-access-points";
import { useStationsQuery } from "../hooks/use-stations";

type AccessPoint = ReturnType<typeof useAccessPoints>["accessPoints"][number];

export function AccessPointsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [stationFilter, setStationFilter] = useState("");
	const [onlineFilter, setOnlineFilter] = useState("");
	const { accessPoints } = useAccessPoints({
		search: debouncedSearch || undefined,
		stationId: stationFilter || undefined,
		online:
			onlineFilter === "online"
				? true
				: onlineFilter === "offline"
					? false
					: undefined,
	});

	const { stations } = useStationsQuery();

	const activeFilterCount = (stationFilter ? 1 : 0) + (onlineFilter ? 1 : 0);

	function resetFilters() {
		setSearch("");
		setStationFilter("");
		setOnlineFilter("");
	}

	const columns = useMemo<ColumnDef<AccessPoint, unknown>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				cell: ({ row }) => (
					<div>
						<p className="font-medium">{row.original.name}</p>
						{row.original.macAddress && (
							<p className="font-mono text-xs text-muted-foreground">
								{row.original.macAddress}
							</p>
						)}
					</div>
				),
			},
			{
				accessorKey: "station",
				header: "Station",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.station?.name ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				accessorKey: "ipAddress",
				header: "IP Address",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="font-mono text-xs">
						{row.original.ipAddress ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				accessorKey: "signal",
				header: "Signal",
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.signal ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				accessorKey: "boardName",
				header: "Board",
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<span className="text-xs">
						{row.original.boardName ?? (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						)}
					</span>
				),
			},
			{
				accessorKey: "online",
				header: "Status",
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
				id: "customers",
				header: "Customers",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
						<UsersIcon className="size-3" />
						{row.original._count.customers}
					</span>
				),
			},
		],
		[],
	);

	return (
		<ContentCard>
			<ContentCardToolbar>
				<FilterBar
					bare
					searchPlaceholder="Search by name, IP, or MAC..."
					searchValue={search}
					onSearchChange={setSearch}
					activeFilterCount={activeFilterCount}
					onReset={resetFilters}
				>
					{stations.length > 0 && (
						<Combobox
							value={stationFilter || "all"}
							onChange={(val) =>
								setStationFilter(val === "all" ? "" : val)
							}
							options={[
								{ value: "all", label: "All stations" },
								...stations.map((s) => ({
									value: s.id,
									label: s.name,
								})),
							]}
							searchPlaceholder="Search stations…"
							emptyText="No stations found"
							className="w-full sm:w-[170px]"
						/>
					)}
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
				data={accessPoints}
				emptyState={
					accessPoints.length === 0 &&
					!activeFilterCount &&
					!debouncedSearch ? (
						<EmptyState
							icon={WifiIcon}
							title="No access points yet"
							description="Access points will appear here after syncing from iRadius."
						/>
					) : (
						<EmptyState
							icon={WifiIcon}
							title="No results found"
							description="Try adjusting your search or filters."
						/>
					)
				}
			/>
		</ContentCard>
	);
}
