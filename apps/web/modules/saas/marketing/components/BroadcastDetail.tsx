"use client";

import { PageShell } from "@shared/components/PageShell";
import { formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Progress } from "@ui/components/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { useBroadcast, useCancelBroadcast } from "../hooks/use-marketing";
import {
	BROADCAST_STATUS_VARIANTS,
	RECIPIENT_STATUS_VARIANTS,
} from "../lib/status-variants";

interface BroadcastDetailProps {
	broadcastId: string;
	organizationSlug: string;
}

export function BroadcastDetail({
	broadcastId,
	organizationSlug,
}: BroadcastDetailProps) {
	const organizationId = useOrganizationId();
	const { broadcast, recipients, recipientTotal, refetch } =
		useBroadcast(broadcastId);
	const cancel = useCancelBroadcast();

	if (!broadcast) {
		return null;
	}

	const progress =
		broadcast.totalRecipients > 0
			? Math.round(
					((broadcast.sentCount + broadcast.failedCount) /
						broadcast.totalRecipients) *
						100,
				)
			: 0;

	const isInFlight =
		broadcast.status === "pending" || broadcast.status === "running";

	const onCancel = async () => {
		if (!organizationId) {
			return;
		}
		await cancel.mutateAsync({ organizationId, broadcastId });
		await refetch();
	};

	return (
		<PageShell
			title={broadcast.name}
			backTo={`/app/${organizationSlug}/marketing`}
			backLabel="Back to broadcasts"
			badges={
				<Badge
					variant={
						BROADCAST_STATUS_VARIANTS[broadcast.status] ?? "outline"
					}
				>
					{broadcast.status}
				</Badge>
			}
			actions={
				isInFlight ? (
					<Button
						variant="destructive"
						onClick={onCancel}
						disabled={cancel.isPending}
					>
						{cancel.isPending ? "Cancelling…" : "Cancel"}
					</Button>
				) : null
			}
		>
			<div className="grid gap-4 sm:grid-cols-4">
				<Stat label="Recipients" value={broadcast.totalRecipients} />
				<Stat label="Sent" value={broadcast.sentCount} />
				<Stat
					label="Failed"
					value={broadcast.failedCount}
					highlight={broadcast.failedCount > 0}
				/>
				<Stat
					label="Started"
					value={
						broadcast.startedAt
							? formatDateTime(broadcast.startedAt)
							: "—"
					}
				/>
			</div>

			<div className="mt-4 rounded-lg border p-4">
				<div className="mb-2 flex items-center justify-between text-sm">
					<span>Progress</span>
					<span className="text-muted-foreground">{progress}%</span>
				</div>
				<Progress value={progress} />
			</div>

			<div className="mt-6">
				<h3 className="mb-3 font-medium">
					Recipients{" "}
					<span className="text-sm text-muted-foreground">
						({recipientTotal})
					</span>
				</h3>
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Phone</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Salti ID</TableHead>
								<TableHead>WA ID</TableHead>
								<TableHead>Error</TableHead>
								<TableHead>Sent at</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{recipients.map((r) => (
								<TableRow key={r.id}>
									<TableCell className="font-mono text-sm">
										{r.phone}
									</TableCell>
									<TableCell>
										{r.contactName ?? "—"}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												RECIPIENT_STATUS_VARIANTS[
													r.status
												] ?? "outline"
											}
										>
											{r.status}
										</Badge>
									</TableCell>
									<TableCell className="font-mono text-xs">
										{r.saltiMessageId ?? "—"}
									</TableCell>
									<TableCell className="font-mono text-xs">
										{r.waMessageId
											? r.waMessageId.slice(0, 20)
											: "—"}
									</TableCell>
									<TableCell className="max-w-xs truncate text-sm text-destructive">
										{r.errorMessage ?? ""}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{r.sentAt
											? formatDateTime(r.sentAt)
											: "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</div>
		</PageShell>
	);
}

function Stat({
	label,
	value,
	highlight,
}: {
	label: string;
	value: number | string;
	highlight?: boolean;
}) {
	return (
		<div className="rounded-lg border p-4">
			<div className="text-sm text-muted-foreground">{label}</div>
			<div
				className={`mt-1 text-2xl font-semibold ${
					highlight ? "text-destructive" : ""
				}`}
			>
				{value}
			</div>
		</div>
	);
}

export function BroadcastDetailSkeleton() {
	return (
		<PageShell title="Broadcast">
			<div className="h-64 animate-pulse rounded-lg border bg-muted/20" />
		</PageShell>
	);
}
