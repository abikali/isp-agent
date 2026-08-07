"use client";

import { useStationsQuery } from "@saas/customers/client";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { useMemo, useState } from "react";
import { useAssignStations } from "../hooks/use-employees";

export function AssignStationDialog({
	open,
	onOpenChange,
	employeeId,
	currentStationIds,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	employeeId: string;
	currentStationIds: string[];
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* Remount on prop change so local selection resets without a mirror effect */}
			<AssignStationDialogContent
				key={currentStationIds.join(",")}
				onOpenChange={onOpenChange}
				employeeId={employeeId}
				currentStationIds={currentStationIds}
			/>
		</Dialog>
	);
}

function AssignStationDialogContent({
	onOpenChange,
	employeeId,
	currentStationIds,
}: {
	onOpenChange: (open: boolean) => void;
	employeeId: string;
	currentStationIds: string[];
}) {
	const organizationId = useOrganizationId();
	const { stations } = useStationsQuery();
	const assignStations = useAssignStations();
	// react-doctor-disable-next-line react-doctor/no-derived-useState -- intentional init-once; parent remounts via key on currentStationIds change
	const [selected, setSelected] = useState<string[]>(currentStationIds);

	const selectedSet = useMemo(() => new Set(selected), [selected]);

	async function handleSave() {
		if (!organizationId) {
			return;
		}
		await assignStations.mutateAsync({
			organizationId,
			employeeId,
			stationIds: selected,
		});
		onOpenChange(false);
	}

	function toggleStation(stationId: string) {
		setSelected((prev) =>
			prev.includes(stationId)
				? prev.filter((id) => id !== stationId)
				: [...prev, stationId],
		);
	}

	return (
		<DialogContent className="sm:max-w-md">
			<DialogHeader>
				<DialogTitle>Assign Stations</DialogTitle>
			</DialogHeader>
			<div className="max-h-60 space-y-2 overflow-y-auto">
				{stations.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No stations available.
					</p>
				) : (
					stations.map((station) => (
						<label
							key={station.id}
							className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
						>
							<input
								type="checkbox"
								checked={selectedSet.has(station.id)}
								onChange={() => toggleStation(station.id)}
								className="size-4"
							/>
							<span className="text-sm font-medium">
								{station.name}
							</span>
						</label>
					))
				)}
			</div>
			<DialogFooter>
				<Button variant="outline" onClick={() => onOpenChange(false)}>
					Cancel
				</Button>
				<Button
					onClick={handleSave}
					disabled={assignStations.isPending}
				>
					{assignStations.isPending ? "Saving..." : "Save"}
				</Button>
			</DialogFooter>
		</DialogContent>
	);
}
