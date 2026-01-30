"use client";

import { SettingsItem } from "@saas/shared/client";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { formatDistanceToNow } from "date-fns";
import {
	RefreshCwIcon,
	SettingsIcon,
	TrashIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import {
	useConnectionsQuery,
	useDeleteConnectionMutation,
	useSyncContactsMutation,
} from "../hooks/use-connections";
import { getProviderIconClass } from "../lib/providers";
import { ConnectionSettingsDialog } from "./ConnectionSettingsDialog";
import { SyncHistoryDialog } from "./SyncHistoryDialog";

/**
 * Skeleton component for ConnectedIntegrations loading state.
 */
export function ConnectedIntegrationsSkeleton() {
	return (
		<SettingsItem
			title="Connected Integrations"
			description="Manage your active integration connections"
		>
			<div className="space-y-3">
				{Array.from({ length: 2 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center justify-between gap-4"
					>
						<div className="flex items-center gap-3">
							<Skeleton className="size-8 rounded" />
							<div className="space-y-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-32" />
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Skeleton className="h-6 w-20 rounded-full" />
							<Skeleton className="size-8" />
						</div>
					</div>
				))}
			</div>
		</SettingsItem>
	);
}

interface ConnectedIntegrationsProps {
	organizationId: string;
}

export function ConnectedIntegrations({
	organizationId,
}: ConnectedIntegrationsProps) {
	const { data } = useConnectionsQuery(organizationId);
	const connections = data?.connections ?? [];
	const deleteMutation = useDeleteConnectionMutation();
	const syncMutation = useSyncContactsMutation();
	const [selectedConnectionId, setSelectedConnectionId] = useState<
		string | null
	>(null);
	const [historyConnectionId, setHistoryConnectionId] = useState<
		string | null
	>(null);

	const handleDelete = async (connectionId: string) => {
		if (!confirm("Are you sure you want to disconnect this integration?")) {
			return;
		}

		await deleteMutation.mutateAsync({ id: connectionId });
	};

	const handleSync = async (connectionId: string) => {
		await syncMutation.mutateAsync({ connectionId });
	};

	if (connections.length === 0) {
		return null;
	}

	return (
		<>
			<SettingsItem
				title="Connected Integrations"
				description="Manage your active integration connections"
			>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Integration</TableHead>
								<TableHead>Sync Mode</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Last Synced</TableHead>
								<TableHead className="w-[150px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{connections.map((connection) => {
								const iconClass = getProviderIconClass(
									connection.providerConfigKey,
								);

								return (
									<TableRow key={connection.id}>
										<TableCell>
											<div className="flex items-center gap-3">
												<div
													className={`flex size-8 items-center justify-center rounded text-white font-semibold text-xs ${iconClass}`}
												>
													{connection.providerName.charAt(
														0,
													)}
												</div>
												<div>
													<div className="font-medium">
														{connection.name ||
															connection.providerName}
													</div>
													{connection.name && (
														<div className="text-xs text-muted-foreground">
															{
																connection.providerName
															}
														</div>
													)}
												</div>
											</div>
										</TableCell>
										<TableCell>
											<Badge
												variant={
													connection.syncMode ===
													"auto"
														? "default"
														: "secondary"
												}
											>
												{connection.syncMode === "auto"
													? "Automatic"
													: "Manual"}
											</Badge>
										</TableCell>
										<TableCell>
											{connection.status ===
											"connected" ? (
												<Badge
													variant="outline"
													className="text-green-600 border-green-200 bg-green-50"
												>
													Connected
												</Badge>
											) : connection.status ===
												"error" ? (
												<div className="flex items-center gap-1 text-destructive">
													<XCircleIcon className="size-4" />
													<span className="text-sm">
														Error
													</span>
												</div>
											) : (
												<Badge variant="secondary">
													Disconnected
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{connection.lastSyncAt
												? formatDistanceToNow(
														new Date(
															connection.lastSyncAt,
														),
														{ addSuffix: true },
													)
												: "Never"}
										</TableCell>
										<TableCell>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="icon"
													onClick={() =>
														handleSync(
															connection.id,
														)
													}
													disabled={
														syncMutation.isPending ||
														connection.status !==
															"connected"
													}
													title="Sync now"
												>
													<RefreshCwIcon
														className={`size-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
													/>
												</Button>
												<Button
													variant="ghost"
													size="icon"
													onClick={() =>
														setSelectedConnectionId(
															connection.id,
														)
													}
													title="Settings"
												>
													<SettingsIcon className="size-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													onClick={() =>
														handleDelete(
															connection.id,
														)
													}
													disabled={
														deleteMutation.isPending
													}
													title="Disconnect"
												>
													<TrashIcon className="size-4 text-destructive" />
												</Button>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			</SettingsItem>

			{/* Settings Dialog */}
			{selectedConnectionId && (
				<ConnectionSettingsDialog
					connectionId={selectedConnectionId}
					open={Boolean(selectedConnectionId)}
					onOpenChange={(open) => {
						if (!open) {
							setSelectedConnectionId(null);
						}
					}}
					onViewHistory={() => {
						setHistoryConnectionId(selectedConnectionId);
						setSelectedConnectionId(null);
					}}
				/>
			)}

			{/* History Dialog */}
			{historyConnectionId && (
				<SyncHistoryDialog
					connectionId={historyConnectionId}
					open={Boolean(historyConnectionId)}
					onOpenChange={(open) => {
						if (!open) {
							setHistoryConnectionId(null);
						}
					}}
				/>
			)}
		</>
	);
}
