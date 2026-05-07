"use client";

import { useCollectors, useCustomerGroups } from "@saas/billing/client";
import { FilterBar } from "@shared/components/FilterBar";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	ActivityIcon,
	LayersIcon,
	MapPinIcon,
	PackageIcon,
	RadioTowerIcon,
	UserCheckIcon,
	WifiIcon,
	XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";

interface CustomerFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	status: string;
	onStatusChange: (value: string) => void;
	planId: string;
	onPlanIdChange: (value: string) => void;
	stationId: string;
	onStationIdChange: (value: string) => void;
	connectionType: string;
	onConnectionTypeChange: (value: string) => void;
	groupName: string;
	onGroupNameChange: (value: string) => void;
	collectorId: string;
	onCollectorIdChange: (value: string) => void;
	hasLocation: "all" | "yes" | "no";
	onHasLocationChange: (value: "all" | "yes" | "no") => void;
}

interface ActiveChip {
	key: string;
	label: ReactNode;
	onRemove: () => void;
}

export function CustomerFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	planId,
	onPlanIdChange,
	stationId,
	onStationIdChange,
	connectionType,
	onConnectionTypeChange,
	groupName,
	onGroupNameChange,
	collectorId,
	onCollectorIdChange,
	hasLocation,
	onHasLocationChange,
}: CustomerFiltersProps) {
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const { groups } = useCustomerGroups();
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	const planLabel = plans.find((p) => p.id === planId)?.name;
	const stationLabel = stations.find((s) => s.id === stationId)?.name;
	const collectorLabel =
		collectorId === "none"
			? "Unassigned"
			: collectors.find((c) => c.id === collectorId)?.name;
	const statusLabel = CUSTOMER_STATUS_OPTIONS.find(
		(o) => o.value === status,
	)?.label;
	const connectionLabel = CONNECTION_TYPE_OPTIONS.find(
		(o) => o.value === connectionType,
	)?.label;

	const chips: ActiveChip[] = [];
	if (status !== "all" && statusLabel) {
		chips.push({
			key: "status",
			label: (
				<>
					<ActivityIcon className="size-3" />
					{statusLabel}
				</>
			),
			onRemove: () => onStatusChange("all"),
		});
	}
	if (planId !== "all" && planLabel) {
		chips.push({
			key: "plan",
			label: (
				<>
					<PackageIcon className="size-3" />
					{planLabel}
				</>
			),
			onRemove: () => onPlanIdChange("all"),
		});
	}
	if (stationId !== "all" && stationLabel) {
		chips.push({
			key: "station",
			label: (
				<>
					<RadioTowerIcon className="size-3" />
					{stationLabel}
				</>
			),
			onRemove: () => onStationIdChange("all"),
		});
	}
	if (groupName !== "all") {
		chips.push({
			key: "group",
			label: (
				<>
					<LayersIcon className="size-3" />
					{groupName}
				</>
			),
			onRemove: () => onGroupNameChange("all"),
		});
	}
	if (collectorId !== "all" && collectorLabel) {
		chips.push({
			key: "collector",
			label: (
				<>
					<UserCheckIcon className="size-3" />
					{collectorLabel}
				</>
			),
			onRemove: () => onCollectorIdChange("all"),
		});
	}
	if (connectionType !== "all" && connectionLabel) {
		chips.push({
			key: "connection",
			label: (
				<>
					<WifiIcon className="size-3" />
					{connectionLabel}
				</>
			),
			onRemove: () => onConnectionTypeChange("all"),
		});
	}
	if (hasLocation !== "all") {
		chips.push({
			key: "location",
			label: (
				<>
					<MapPinIcon className="size-3" />
					{hasLocation === "yes"
						? "Has location"
						: "Missing location"}
				</>
			),
			onRemove: () => onHasLocationChange("all"),
		});
	}

	function handleReset() {
		onStatusChange("all");
		onPlanIdChange("all");
		onStationIdChange("all");
		onConnectionTypeChange("all");
		onGroupNameChange("all");
		onCollectorIdChange("all");
		onHasLocationChange("all");
	}

	return (
		<FilterBar
			searchPlaceholder="Search name, account, phone, email, IP, MAC, address…"
			searchHint="Search across name, account number, username, email, phone, address, IP, MAC, plan, station, collector, group, notes and more"
			searchValue={search}
			onSearchChange={onSearchChange}
			activeFilterCount={chips.length}
			onReset={handleReset}
			belowSlot={
				chips.length > 0 ? (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Active:
						</span>
						{chips.map((chip) => (
							<Badge
								key={chip.key}
								variant="secondary"
								className="gap-1 pl-2 pr-1 py-0.5 font-normal"
							>
								<span className="inline-flex items-center gap-1">
									{chip.label}
								</span>
								<button
									type="button"
									onClick={chip.onRemove}
									className="ml-0.5 inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
									aria-label={"Remove filter"}
								>
									<XIcon className="size-3" />
								</button>
							</Badge>
						))}
						<Button
							variant="ghost"
							size="sm"
							className="h-6 px-2 text-xs text-muted-foreground"
							onClick={handleReset}
						>
							Clear all
						</Button>
					</div>
				) : null
			}
		>
			<Select value={status} onValueChange={onStatusChange}>
				<SelectTrigger
					className="w-full sm:w-[150px]"
					leadingIcon={<ActivityIcon />}
				>
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All statuses</SelectItem>
					{CUSTOMER_STATUS_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={planId} onValueChange={onPlanIdChange}>
				<SelectTrigger
					className="w-full sm:w-[160px]"
					leadingIcon={<PackageIcon />}
				>
					<SelectValue placeholder="Plan" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All plans</SelectItem>
					{plans.map((p) => (
						<SelectItem key={p.id} value={p.id}>
							{p.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={stationId} onValueChange={onStationIdChange}>
				<SelectTrigger
					className="w-full sm:w-[160px]"
					leadingIcon={<RadioTowerIcon />}
				>
					<SelectValue placeholder="Station" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All stations</SelectItem>
					{stations.map((s) => (
						<SelectItem key={s.id} value={s.id}>
							{s.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={groupName} onValueChange={onGroupNameChange}>
				<SelectTrigger
					className="w-full sm:w-[150px]"
					leadingIcon={<LayersIcon />}
				>
					<SelectValue placeholder="Group" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All groups</SelectItem>
					{groups.map((g) => (
						<SelectItem key={g} value={g}>
							{g}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select value={collectorId} onValueChange={onCollectorIdChange}>
				<SelectTrigger
					className="w-full sm:w-[170px]"
					leadingIcon={<UserCheckIcon />}
				>
					<SelectValue placeholder="Collector" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All collectors</SelectItem>
					<SelectItem value="none">Unassigned</SelectItem>
					{collectors.map((c) => (
						<SelectItem key={c.id} value={c.id}>
							{c.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				value={connectionType}
				onValueChange={onConnectionTypeChange}
			>
				<SelectTrigger
					className="w-full sm:w-[150px]"
					leadingIcon={<WifiIcon />}
				>
					<SelectValue placeholder="Connection" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All connections</SelectItem>
					{CONNECTION_TYPE_OPTIONS.map((opt) => (
						<SelectItem key={opt.value} value={opt.value}>
							{opt.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				value={hasLocation}
				onValueChange={(v) =>
					onHasLocationChange(v as "all" | "yes" | "no")
				}
			>
				<SelectTrigger
					className="w-full sm:w-[170px]"
					leadingIcon={<MapPinIcon />}
				>
					<SelectValue placeholder="Location" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">Any location</SelectItem>
					<SelectItem value="yes">Has location</SelectItem>
					<SelectItem value="no">Missing location</SelectItem>
				</SelectContent>
			</Select>
		</FilterBar>
	);
}
