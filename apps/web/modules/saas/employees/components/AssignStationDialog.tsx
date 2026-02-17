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
import { useEffect, useState } from "react";
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
	const organizationId = useOrganizationId();
	const { stations } = useStationsQuery();
	const assignStations = useAssignStations();
	const [selected, setSelected] = useState<string[]>(currentStationIds);

	useEffect(() => {
		setSelected(currentStationIds);
	}, [currentStationIds]);

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
		<Dialog open={open} onOpenChange={onOpenChange}>
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
									checked={selected.includes(station.id)}
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
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
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
		</Dialog>
	);
}
