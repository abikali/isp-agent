"use client";

import { Badge } from "@ui/components/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
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
	AlertCircleIcon,
	CheckCircleIcon,
	ClockIcon,
	Loader2Icon,
} from "lucide-react";
import {
	useConnectionsQueryNonSuspense,
	useSyncHistoryQuery,
} from "../hooks/use-connections";
import { getProviderIconClass } from "../lib/providers";

interface SyncOperationItem {
	id: string;
	type: string;
	status: string;
	trigger: string | null;
	totalContacts: number;
	successCount: number;
	errorCount: number;
	errors: unknown;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
}

interface SyncHistoryDialogProps {
	connectionId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function SyncStatusBadge({ status }: { status: string }) {
	switch (status) {
		case "completed":
			return (
				<Badge
					variant="outline"
					className="text-green-600 border-green-200 bg-green-50"
				>
					<CheckCircleIcon className="mr-1 size-3" />
					Completed
				</Badge>
			);
		case "failed":
			return (
				<Badge variant="destructive">
					<AlertCircleIcon className="mr-1 size-3" />
					Failed
				</Badge>
			);
		case "in_progress":
			return (
				<Badge variant="secondary">
					<Loader2Icon className="mr-1 size-3 animate-spin" />
					In Progress
				</Badge>
			);
		case "pending":
			return (
				<Badge variant="outline">
					<ClockIcon className="mr-1 size-3" />
					Pending
				</Badge>
			);
		default:
			return <Badge variant="outline">{status}</Badge>;
	}
}

function SyncTypeBadge({ type }: { type: string }) {
	switch (type) {
		case "push_single":
			return <Badge variant="secondary">Single Contact</Badge>;
		case "push_bulk":
			return <Badge variant="secondary">Bulk Push</Badge>;
		case "sync_all":
			return <Badge variant="default">Full Sync</Badge>;
		default:
			return <Badge variant="outline">{type}</Badge>;
	}
}

export function SyncHistoryDialog({
	connectionId,
	open,
	onOpenChange,
}: SyncHistoryDialogProps) {
	const { data: connectionsData } = useConnectionsQueryNonSuspense();
	const { data: historyData, isLoading: isHistoryLoading } =
		useSyncHistoryQuery(connectionId);

	const connection = connectionsData?.connections.find(
		(c) => c.id === connectionId,
	);
	const history: SyncOperationItem[] = historyData?.operations ?? [];

	if (!connection) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent>
					<DialogHeader>
						<Skeleton className="h-6 w-48" />
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	const iconClass = getProviderIconClass(connection.providerConfigKey);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<div
							className={`flex size-10 items-center justify-center rounded-lg text-white font-semibold text-sm ${iconClass}`}
						>
							{connection.providerName.charAt(0)}
						</div>
						<div>
							<DialogTitle>Sync History</DialogTitle>
							<DialogDescription>
								Recent sync operations for{" "}
								{connection.name || connection.providerName}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="py-4">
					{isHistoryLoading ? (
						<div className="space-y-3">
							{Array.from({ length: 3 }).map((_, i) => (
								<div
									key={i}
									className="flex items-center gap-4"
								>
									<Skeleton className="h-6 w-20" />
									<Skeleton className="h-6 w-24" />
									<Skeleton className="h-6 flex-1" />
									<Skeleton className="h-6 w-16" />
								</div>
							))}
						</div>
					) : history.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<ClockIcon className="mx-auto size-8 mb-2 opacity-50" />
							<p>No sync history yet</p>
							<p className="text-sm">
								Sync operations will appear here once you start
								syncing
							</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Status</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Contacts</TableHead>
										<TableHead>Result</TableHead>
										<TableHead>Time</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{history.map((op) => (
										<TableRow key={op.id}>
											<TableCell>
												<SyncStatusBadge
													status={op.status}
												/>
											</TableCell>
											<TableCell>
												<SyncTypeBadge type={op.type} />
											</TableCell>
											<TableCell className="font-medium">
												{op.totalContacts}
											</TableCell>
											<TableCell>
												{op.status === "completed" ? (
													<span className="text-sm">
														<span className="text-green-600">
															{op.successCount}{" "}
															synced
														</span>
														{op.errorCount > 0 && (
															<>
																{" / "}
																<span className="text-destructive">
																	{
																		op.errorCount
																	}{" "}
																	failed
																</span>
															</>
														)}
													</span>
												) : op.status === "failed" ? (
													<span className="text-sm text-destructive">
														Sync failed
													</span>
												) : (
													<span className="text-sm text-muted-foreground">
														—
													</span>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
												{op.completedAt
													? formatDistanceToNow(
															new Date(
																op.completedAt,
															),
															{
																addSuffix: true,
															},
														)
													: op.startedAt
														? formatDistanceToNow(
																new Date(
																	op.startedAt,
																),
																{
																	addSuffix: true,
																},
															)
														: formatDistanceToNow(
																new Date(
																	op.createdAt,
																),
																{
																	addSuffix: true,
																},
															)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
