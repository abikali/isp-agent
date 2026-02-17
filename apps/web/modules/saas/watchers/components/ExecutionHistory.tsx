"use client";

import { Badge } from "@ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { useWatcherExecutions } from "../hooks/use-executions";

function formatTime(date: string | Date): string {
	return new Date(date).toLocaleString();
}

export function ExecutionHistory({ watcherId }: { watcherId: string }) {
	const { executions } = useWatcherExecutions(watcherId);

	if (executions.length === 0) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				No executions yet. The first check will run shortly.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Time</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Latency</TableHead>
					<TableHead>Message</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{executions.map((exec) => (
					<TableRow key={exec.id}>
						<TableCell className="whitespace-nowrap text-sm">
							{formatTime(exec.createdAt)}
						</TableCell>
						<TableCell>
							<Badge
								variant={
									exec.status === "up"
										? "default"
										: "destructive"
								}
							>
								{exec.status}
							</Badge>
						</TableCell>
						<TableCell className="text-sm">
							{exec.latencyMs != null
								? `${exec.latencyMs}ms`
								: "—"}
						</TableCell>
						<TableCell className="max-w-xs truncate text-sm text-muted-foreground">
							{exec.message ?? "—"}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
