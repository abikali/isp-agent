"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { formatDateTime } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { MegaphoneIcon, PlusIcon } from "lucide-react";
import { useBroadcasts } from "../hooks/use-marketing";
import {
	AUDIENCE_LABELS,
	BROADCAST_STATUS_VARIANTS,
} from "../lib/status-variants";

interface BroadcastsListProps {
	organizationSlug: string;
}

export function BroadcastsList({ organizationSlug }: BroadcastsListProps) {
	const { items, total } = useBroadcasts();

	return (
		<PageShell
			title="Marketing"
			description="WhatsApp broadcasts via Salti. Send template messages to ISP customers, contact groups, or custom lists."
			actions={
				<Button asChild>
					<Link
						to="/app/$organizationSlug/marketing/new"
						params={{ organizationSlug }}
					>
						<PlusIcon className="size-4" />
						New broadcast
					</Link>
				</Button>
			}
		>
			{items.length === 0 ? (
				<EmptyState
					icon={MegaphoneIcon}
					title="No broadcasts yet"
					description="Launch your first WhatsApp broadcast to reach your customers."
					action={
						<Button asChild>
							<Link
								to="/app/$organizationSlug/marketing/new"
								params={{ organizationSlug }}
							>
								Create broadcast
							</Link>
						</Button>
					}
				/>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Template</TableHead>
								<TableHead>Audience</TableHead>
								<TableHead className="text-right">
									Recipients
								</TableHead>
								<TableHead className="text-right">
									Sent
								</TableHead>
								<TableHead className="text-right">
									Failed
								</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((b) => (
								<TableRow key={b.id}>
									<TableCell className="font-medium">
										<Link
											to="/app/$organizationSlug/marketing/$broadcastId"
											params={{
												organizationSlug,
												broadcastId: b.id,
											}}
											className="hover:underline"
											preload="intent"
										>
											{b.name}
										</Link>
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{b.templateName}{" "}
										<span className="text-xs">
											({b.templateLang})
										</span>
									</TableCell>
									<TableCell>
										<Badge variant="outline">
											{AUDIENCE_LABELS[b.audienceType] ??
												b.audienceType}
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										{b.totalRecipients}
									</TableCell>
									<TableCell className="text-right">
										{b.sentCount}
									</TableCell>
									<TableCell className="text-right">
										{b.failedCount}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												BROADCAST_STATUS_VARIANTS[
													b.status
												] ?? "outline"
											}
										>
											{b.status}
										</Badge>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{formatDateTime(b.createdAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
			{total > items.length ? (
				<p className="mt-4 text-sm text-muted-foreground">
					Showing {items.length} of {total} broadcasts.
				</p>
			) : null}
		</PageShell>
	);
}

export function BroadcastsListSkeleton() {
	return (
		<PageShell title="Marketing">
			<div className="h-64 animate-pulse rounded-lg border bg-muted/20" />
		</PageShell>
	);
}
