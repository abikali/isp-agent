"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import {
	HardHatIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
	UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { useDeleteStation, useStations } from "../hooks/use-stations";
import { STATION_STATUS_LABELS } from "../lib/constants";
import { CreateStationDialog } from "./CreateStationDialog";
import { EditStationDialog } from "./EditStationDialog";

export function StationsList() {
	const { stations } = useStations();
	const deleteStation = useDeleteStation();
	const [showCreate, setShowCreate] = useState(false);
	const [editingStation, setEditingStation] = useState<
		(typeof stations)[number] | null
	>(null);

	function getStatusVariant(status: string) {
		switch (status) {
			case "ACTIVE":
				return "default" as const;
			case "MAINTENANCE":
				return "secondary" as const;
			case "OFFLINE":
				return "destructive" as const;
			default:
				return "secondary" as const;
		}
	}

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Stations</h1>
					<p className="text-muted-foreground">
						Manage network access points and towers
					</p>
				</div>
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Station
				</Button>
			</div>

			{stations.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<h3 className="mb-1 text-lg font-medium">
						No stations yet
					</h3>
					<p className="mb-4 text-sm text-muted-foreground">
						Create your first station to organize customer
						connections.
					</p>
					<Button onClick={() => setShowCreate(true)}>
						<PlusIcon className="mr-2 size-4" />
						Create Station
					</Button>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{stations.map((station) => (
						<Card key={station.id}>
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between">
									<CardTitle className="text-base">
										{station.name}
									</CardTitle>
									<Badge
										variant={getStatusVariant(
											station.status,
										)}
									>
										{STATION_STATUS_LABELS[
											station.status
										] ?? station.status}
									</Badge>
								</div>
								{station.address && (
									<p className="text-sm text-muted-foreground line-clamp-1">
										{station.address}
									</p>
								)}
							</CardHeader>
							<CardContent>
								<div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
									<span className="flex items-center gap-1">
										<UsersIcon className="size-3" />
										{station._count.customers}
										{station.capacity
											? ` / ${station.capacity}`
											: ""}{" "}
										customers
									</span>
									<span className="flex items-center gap-1">
										<HardHatIcon className="size-3" />
										{station._count.employees} employees
									</span>
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											setEditingStation(station)
										}
									>
										<PencilIcon className="mr-1 size-3" />
										Edit
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											if (
												confirm("Delete this station?")
											) {
												deleteStation.mutate({
													organizationId: station.id,
													id: station.id,
												});
											}
										}}
										disabled={station._count.customers > 0}
									>
										<TrashIcon className="mr-1 size-3" />
										Delete
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
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
		</div>
	);
}
