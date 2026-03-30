"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { DataTable } from "@ui/components/data-table";
import { useWatcherExecutions } from "../hooks/use-executions";

function formatTime(date: string | Date): string {
	return new Date(date).toLocaleString();
}

interface Execution {
	id: string;
	createdAt: string | Date;
	status: string;
	latencyMs: number | null;
	message: string | null;
}

const columns: ColumnDef<Execution, unknown>[] = [
	{
		accessorKey: "createdAt",
		header: "Time",
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-sm">
				{formatTime(row.original.createdAt)}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => (
			<Badge
				variant={
					row.original.status === "up" ? "default" : "destructive"
				}
			>
				{row.original.status}
			</Badge>
		),
	},
	{
		accessorKey: "latencyMs",
		header: "Latency",
		cell: ({ row }) => (
			<span className="text-sm">
				{row.original.latencyMs != null
					? `${row.original.latencyMs}ms`
					: "—"}
			</span>
		),
	},
	{
		accessorKey: "message",
		header: "Message",
		cell: ({ row }) => (
			<span className="max-w-xs truncate text-sm text-muted-foreground">
				{row.original.message ?? "—"}
			</span>
		),
	},
];

export function ExecutionHistory({ watcherId }: { watcherId: string }) {
	const { executions } = useWatcherExecutions(watcherId);

	return (
		<DataTable
			columns={columns}
			data={executions}
			emptyState={
				<p className="py-8 text-center text-sm text-muted-foreground">
					No executions yet. The first check will run shortly.
				</p>
			}
		/>
	);
}
