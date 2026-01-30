"use client";

import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { RadioGroup, RadioGroupItem } from "@ui/components/radio-group";
import { Skeleton } from "@ui/components/skeleton";
import { HistoryIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import {
	useConnectionsQueryNonSuspense,
	useUpdateConnectionMutation,
} from "../hooks/use-connections";
import { AUTO_SYNC_EVENTS, getProviderIconClass } from "../lib/providers";

interface ConnectionSettingsDialogProps {
	connectionId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onViewHistory?: () => void;
}

export function ConnectionSettingsDialog({
	connectionId,
	open,
	onOpenChange,
	onViewHistory,
}: ConnectionSettingsDialogProps) {
	const { data, isLoading } = useConnectionsQueryNonSuspense();
	const updateMutation = useUpdateConnectionMutation();

	const connection = data?.connections.find((c) => c.id === connectionId);

	const [name, setName] = useState("");
	const [syncMode, setSyncMode] = useState<"manual" | "auto">("manual");
	const [autoSyncEvents, setAutoSyncEvents] = useState<string[]>([]);

	// Initialize form when connection loads
	useEffect(() => {
		if (connection) {
			setName(connection.name || "");
			setSyncMode(connection.syncMode as "manual" | "auto");
			setAutoSyncEvents(connection.autoSyncEvents || []);
		}
	}, [connection]);

	const handleSave = async () => {
		await updateMutation.mutateAsync({
			id: connectionId,
			name: name || undefined,
			syncMode,
			autoSyncEvents:
				syncMode === "auto"
					? (autoSyncEvents as (
							| "contact.created"
							| "contact.updated"
						)[])
					: [],
		});
		onOpenChange(false);
	};

	const toggleEvent = (eventKey: "contact.created" | "contact.updated") => {
		setAutoSyncEvents((prev) =>
			prev.includes(eventKey)
				? prev.filter((e) => e !== eventKey)
				: [...prev, eventKey],
		);
	};

	if (isLoading || !connection) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent>
					<DialogHeader>
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-4 w-64" />
					</DialogHeader>
					<div className="space-y-4 py-4">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-24 w-full" />
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	const iconClass = getProviderIconClass(connection.providerConfigKey);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<div
							className={`flex size-10 items-center justify-center rounded-lg text-white font-semibold text-sm ${iconClass}`}
						>
							{connection.providerName.charAt(0)}
						</div>
						<div>
							<DialogTitle>
								{connection.providerName} Settings
							</DialogTitle>
							<DialogDescription>
								Configure how contacts sync with{" "}
								{connection.providerName}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-6 py-4">
					{/* Connection Name */}
					<div className="space-y-2">
						<Label htmlFor="connection-name">
							Connection Name (Optional)
						</Label>
						<Input
							id="connection-name"
							placeholder={connection.providerName}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							Give this connection a custom name to identify it
						</p>
					</div>

					{/* Sync Mode */}
					<div className="space-y-3">
						<Label>Sync Mode</Label>
						<RadioGroup
							value={syncMode}
							onValueChange={(value) =>
								setSyncMode(value as "manual" | "auto")
							}
						>
							<div className="flex items-start space-x-3 rounded-lg border p-3">
								<RadioGroupItem
									value="manual"
									id="sync-manual"
								/>
								<div className="space-y-1">
									<Label
										htmlFor="sync-manual"
										className="font-medium cursor-pointer"
									>
										Manual
									</Label>
									<p className="text-xs text-muted-foreground">
										Sync contacts when you click the sync
										button
									</p>
								</div>
							</div>
							<div className="flex items-start space-x-3 rounded-lg border p-3">
								<RadioGroupItem value="auto" id="sync-auto" />
								<div className="space-y-1">
									<Label
										htmlFor="sync-auto"
										className="font-medium cursor-pointer"
									>
										Automatic
									</Label>
									<p className="text-xs text-muted-foreground">
										Automatically sync contacts based on
										triggers
									</p>
								</div>
							</div>
						</RadioGroup>
					</div>

					{/* Auto-sync Events */}
					{syncMode === "auto" && (
						<div className="space-y-3">
							<Label>Auto-sync Triggers</Label>
							<div className="space-y-2 rounded-lg border p-3">
								{AUTO_SYNC_EVENTS.map((event) => (
									<div
										key={event.key}
										className="flex items-start space-x-3"
									>
										<Checkbox
											id={`event-${event.key}`}
											checked={autoSyncEvents.includes(
												event.key,
											)}
											onCheckedChange={() =>
												toggleEvent(event.key)
											}
										/>
										<div className="space-y-0.5">
											<Label
												htmlFor={`event-${event.key}`}
												className="font-medium cursor-pointer"
											>
												{event.label}
											</Label>
											<p className="text-xs text-muted-foreground">
												{event.description}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="flex-col sm:flex-row gap-2">
					{onViewHistory && (
						<Button
							variant="outline"
							onClick={onViewHistory}
							className="sm:mr-auto"
						>
							<HistoryIcon className="mr-2 size-4" />
							View History
						</Button>
					)}
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={updateMutation.isPending}
					>
						{updateMutation.isPending && (
							<Loader2Icon className="mr-2 size-4 animate-spin" />
						)}
						Save Settings
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
