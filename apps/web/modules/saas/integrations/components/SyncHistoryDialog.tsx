"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Skeleton } from "@ui/components/skeleton";
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

const syncHistoryColumns: ColumnDef<SyncOperationItem, unknown>[] = [
	{
		accessorKey: "status",
		header: "Status",
		enableSorting: false,
		cell: ({ row }) => <SyncStatusBadge status={row.original.status} />,
	},
	{
		accessorKey: "type",
		header: "Type",
		enableSorting: false,
		cell: ({ row }) => <SyncTypeBadge type={row.original.type} />,
	},
	{
		accessorKey: "totalContacts",
		header: "Contacts",
		enableSorting: false,
		cell: ({ row }) => (
			<span className="font-medium">{row.original.totalContacts}</span>
		),
	},
	{
		id: "result",
		header: "Result",
		enableSorting: false,
		cell: ({ row }) => {
			const op = row.original;
			if (op.status === "completed") {
				return (
					<span className="text-sm">
						<span className="text-green-600">
							{op.successCount} synced
						</span>
						{op.errorCount > 0 && (
							<>
								{" / "}
								<span className="text-destructive">
									{op.errorCount} failed
								</span>
							</>
						)}
					</span>
				);
			}
			if (op.status === "failed") {
				return (
					<span className="text-sm text-destructive">
						Sync failed
					</span>
				);
			}
			return <span className="text-sm text-muted-foreground">—</span>;
		},
	},
	{
		accessorKey: "completedAt",
		header: "Time",
		enableSorting: false,
		cell: ({ row }) => {
			const op = row.original;
			const date = op.completedAt ?? op.startedAt ?? op.createdAt;
			return (
				<span className="text-muted-foreground text-sm whitespace-nowrap">
					{formatDistanceToNow(new Date(date), { addSuffix: true })}
				</span>
			);
		},
	},
];

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
					<DataTable
						columns={syncHistoryColumns}
						data={history}
						isLoading={isHistoryLoading}
						pageSize={10}
						emptyState={
							<div className="text-center py-8 text-muted-foreground">
								<ClockIcon className="mx-auto size-8 mb-2 opacity-50" />
								<p>No sync history yet</p>
								<p className="text-sm">
									Sync operations will appear here once you
									start syncing
								</p>
							</div>
						}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
