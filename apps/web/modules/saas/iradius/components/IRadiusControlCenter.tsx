"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { TopConsumersChart } from "@shared/components/charts";
import { formatBytes } from "@shared/components/charts/chart-utils";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { cn } from "@ui/lib";
import {
	ActivityIcon,
	AlertTriangleIcon,
	ArrowUpRightIcon,
	CheckCircleIcon,
	CircleIcon,
	GaugeIcon,
	RadioIcon,
	RouterIcon,
	XCircleIcon,
} from "lucide-react";

function formatRelative(d: Date | string | null): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	const diffMs = Date.now() - date.getTime();
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) {
		return "Just now";
	}
	if (mins < 60) {
		return `${mins}m ago`;
	}
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) {
		return `${hrs}h ago`;
	}
	return `${Math.floor(hrs / 24)}d ago`;
}

function StatBlock({
	label,
	value,
	hint,
	tone = "default",
}: {
	label: string;
	value: string | number;
	hint?: string;
	tone?: "default" | "success" | "warning" | "danger";
}) {
	const toneClasses = {
		default: "text-foreground",
		success: "text-success",
		warning: "text-warning",
		danger: "text-destructive",
	};
	return (
		<div className="space-y-1">
			<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div
				className={cn(
					"text-2xl font-medium tabular-nums tracking-tight",
					toneClasses[tone],
				)}
			>
				{value}
			</div>
			{hint && (
				<div className="text-xs text-muted-foreground">{hint}</div>
			)}
		</div>
	);
}

export function IRadiusControlCenter() {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		return null;
	}
	return <IRadiusControlCenterInner organizationId={organizationId} />;
}

function IRadiusControlCenterInner({
	organizationId,
}: {
	organizationId: string;
}) {
	const { organizationSlug } = useParams({ strict: false }) as {
		organizationSlug?: string;
	};
	const navigate = useNavigate();

	const { data: health } = useSuspenseQuery({
		...orpc.iradius.health.queryOptions({ input: { organizationId } }),
		refetchInterval: 30_000,
	});
	const { data: syncs } = useSuspenseQuery(
		orpc.iradius.recentSyncs.queryOptions({
			input: { organizationId, limit: 5 },
		}),
	);
	const { data: nas } = useSuspenseQuery({
		...orpc.iradius.nasHealth.queryOptions({ input: { organizationId } }),
		refetchInterval: 60_000,
	});
	const { data: topConsumers } = useSuspenseQuery({
		...orpc.iradius.topConsumers.queryOptions({
			input: { organizationId, limit: 10, window: "daily" },
		}),
		refetchInterval: 60_000,
	});

	const lastSync = syncs.operations[0];
	const lastSyncRelative = lastSync
		? formatRelative(lastSync.completedAt ?? lastSync.createdAt)
		: "Never";

	const stationsOnline = nas.stations.filter((s) => s.online).length;
	const apsOnline = nas.accessPoints.filter((a) => a.online).length;

	return (
		<div className="space-y-6">
			<ContentCard>
				<ContentCardSection>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-3">
							<div
								className={cn(
									"flex size-10 items-center justify-center rounded-md",
									health.ok
										? "bg-success/10 text-success"
										: "bg-destructive/10 text-destructive",
								)}
							>
								{health.ok ? (
									<CheckCircleIcon className="size-5" />
								) : (
									<XCircleIcon className="size-5" />
								)}
							</div>
							<div>
								<div className="text-sm font-medium">
									iRadius{" "}
									{health.ok
										? "is reachable"
										: "is unreachable"}
								</div>
								<div className="text-xs text-muted-foreground">
									Probed in {health.latencyMs}ms · last sync{" "}
									{lastSyncRelative}
								</div>
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								navigate({
									to: "/app/$organizationSlug/settings/iradius",
									params: {
										organizationSlug:
											organizationSlug ?? "",
									},
								})
							}
						>
							Open sync settings
							<ArrowUpRightIcon className="ml-1.5 size-3.5" />
						</Button>
					</div>
				</ContentCardSection>
				{health.liveStats && (
					<ContentCardSection>
						<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
							<StatBlock
								label="Online now"
								value={health.liveStats.online.toLocaleString()}
								hint={`of ${health.liveStats.totalSubscribers.toLocaleString()} subscribers`}
								tone="success"
							/>
							<StatBlock
								label="Offline"
								value={health.liveStats.offline.toLocaleString()}
								tone="default"
							/>
							<StatBlock
								label="Expired"
								value={health.liveStats.expired.toLocaleString()}
								tone="warning"
							/>
							<StatBlock
								label="In FUP"
								value={health.liveStats.fup.toLocaleString()}
								tone="warning"
							/>
						</div>
					</ContentCardSection>
				)}
				{syncs.pendingConflicts > 0 && (
					<ContentCardSection>
						<div className="flex items-center gap-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
							<AlertTriangleIcon className="size-4 text-warning" />
							<span className="flex-1 text-sm">
								{syncs.pendingConflicts} unresolved sync
								conflict
								{syncs.pendingConflicts === 1 ? "" : "s"}
							</span>
							<Button
								size="sm"
								variant="ghost"
								onClick={() =>
									navigate({
										to: "/app/$organizationSlug/customers",
										params: {
											organizationSlug:
												organizationSlug ?? "",
										},
										search: { conflicts: "1" } as never,
									})
								}
							>
								Review
							</Button>
						</div>
					</ContentCardSection>
				)}
			</ContentCard>

			<div className="grid gap-6 lg:grid-cols-3">
				<ContentCard className="lg:col-span-2">
					<ContentCardSection className="border-b border-border">
						<div className="text-sm font-medium">NAS health</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Stations and access points live from iRadius
						</p>
					</ContentCardSection>
					<Tabs defaultValue="stations">
						<ContentCardSection>
							<TabsList>
								<TabsTrigger value="stations">
									<RouterIcon className="size-3.5" />
									Stations ({stationsOnline}/
									{nas.stations.length})
								</TabsTrigger>
								<TabsTrigger value="aps">
									<RadioIcon className="size-3.5" />
									Access points ({apsOnline}/
									{nas.accessPoints.length})
								</TabsTrigger>
							</TabsList>
						</ContentCardSection>
						<TabsContent value="stations">
							{nas.stations.length === 0 ? (
								<ContentCardSection>
									<p className="py-6 text-center text-sm text-muted-foreground">
										No station telemetry available
									</p>
								</ContentCardSection>
							) : (
								<div className="divide-y divide-border">
									{nas.stations.slice(0, 12).map((s) => (
										<div
											key={s.externalId}
											className="flex items-center gap-3 px-6 py-3 text-sm"
										>
											<CircleIcon
												className={cn(
													"size-2.5 shrink-0 fill-current",
													s.online
														? "text-success"
														: "text-muted-foreground/40",
												)}
											/>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium">
													{s.boardName ??
														`Station ${s.externalId}`}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{s.version
														? `v${s.version} · `
														: ""}
													{s.uptime ?? "—"}
												</div>
											</div>
											{s.cpuLoad && (
												<Badge
													variant="outline"
													className="font-mono text-[10px]"
												>
													<GaugeIcon className="size-2.5" />
													{s.cpuLoad}
												</Badge>
											)}
										</div>
									))}
								</div>
							)}
						</TabsContent>
						<TabsContent value="aps">
							{nas.accessPoints.length === 0 ? (
								<ContentCardSection>
									<p className="py-6 text-center text-sm text-muted-foreground">
										No AP telemetry available
									</p>
								</ContentCardSection>
							) : (
								<div className="divide-y divide-border">
									{nas.accessPoints.slice(0, 12).map((ap) => (
										<div
											key={ap.externalId}
											className="flex items-center gap-3 px-6 py-3 text-sm"
										>
											<CircleIcon
												className={cn(
													"size-2.5 shrink-0 fill-current",
													ap.online
														? "text-success"
														: "text-muted-foreground/40",
												)}
											/>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium">
													{ap.boardName ??
														`AP ${ap.externalId}`}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{ap.signal
														? `${ap.signal} dBm · `
														: ""}
													{ap.uptime ?? "—"}
												</div>
											</div>
											{ap.fullDuplex && (
												<Badge
													variant="outline"
													className="text-[10px]"
												>
													Full duplex
												</Badge>
											)}
										</div>
									))}
								</div>
							)}
						</TabsContent>
					</Tabs>
				</ContentCard>

				<ContentCard>
					<ContentCardSection className="border-b border-border">
						<div className="text-sm font-medium">
							Recent sync runs
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Last 5 iRadius sync operations
						</p>
					</ContentCardSection>
					{syncs.operations.length === 0 ? (
						<ContentCardSection>
							<p className="py-6 text-center text-sm text-muted-foreground">
								No sync history yet
							</p>
						</ContentCardSection>
					) : (
						<div className="divide-y divide-border">
							{syncs.operations.map((op) => {
								const isActive =
									op.status === "running" ||
									op.status === "pending";
								const failed = op.status === "failed";
								return (
									<div
										key={op.id}
										className="flex items-start gap-3 px-6 py-3 text-sm"
									>
										<div
											className={cn(
												"mt-0.5 size-2 shrink-0 rounded-full",
												isActive
													? "bg-info animate-pulse"
													: failed
														? "bg-destructive"
														: "bg-success",
											)}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center justify-between gap-2">
												<span className="font-medium capitalize">
													{op.status}
												</span>
												<span className="text-xs text-muted-foreground">
													{formatRelative(
														op.completedAt ??
															op.createdAt,
													)}
												</span>
											</div>
											<div className="mt-0.5 text-xs text-muted-foreground">
												{op.processedCustomers.toLocaleString()}{" "}
												/{" "}
												{op.totalCustomers.toLocaleString()}{" "}
												customers
												{op.totalConflicts > 0 && (
													<>
														{" · "}
														<span className="text-warning">
															{op.totalConflicts}{" "}
															conflict
															{op.totalConflicts ===
															1
																? ""
																: "s"}
														</span>
													</>
												)}
												{op.removedRecords > 0 && (
													<>
														{" · "}
														{op.removedRecords}{" "}
														removed
													</>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</ContentCard>
			</div>

			<ContentCard>
				<ContentCardSection className="border-b border-border">
					<div className="text-sm font-medium">
						Top bandwidth consumers
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						Highest daily traffic this billing cycle
					</p>
				</ContentCardSection>
				<ContentCardSection>
					{topConsumers.consumers.length === 0 ? (
						<p className="py-8 text-center text-sm text-muted-foreground">
							No bandwidth data yet — waiting for next sync
						</p>
					) : (
						<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
							<TopConsumersChart
								data={topConsumers.consumers.map((c) => ({
									username: c.username,
									fullName: c.fullName,
									bytes: c.totalBytes,
								}))}
								onConsumerClick={(username) => {
									const match = topConsumers.consumers.find(
										(c) => c.username === username,
									);
									if (match && organizationSlug) {
										navigate({
											to: "/app/$organizationSlug/customers/$customerId",
											params: {
												organizationSlug,
												customerId: match.id,
											},
										});
									}
								}}
							/>
							<div className="space-y-1.5 self-start">
								<div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
									<span>Customer</span>
									<span className="text-right">↓ DL</span>
									<span className="text-right">↑ UL</span>
								</div>
								{topConsumers.consumers.map((c) => (
									<div
										key={c.id}
										className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-xs hover:bg-accent/40"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-1.5 truncate font-medium">
												<CircleIcon
													className={cn(
														"size-2 shrink-0 fill-current",
														c.online
															? "text-success"
															: "text-muted-foreground/40",
													)}
												/>
												{c.fullName}
											</div>
											<div className="truncate font-mono text-[10px] text-muted-foreground">
												{c.username}
											</div>
										</div>
										<span className="tabular-nums text-right text-muted-foreground">
											{formatBytes(c.downloadBytes)}
										</span>
										<span className="tabular-nums text-right text-muted-foreground">
											{formatBytes(c.uploadBytes)}
										</span>
									</div>
								))}
							</div>
						</div>
					)}
				</ContentCardSection>
			</ContentCard>
		</div>
	);
}

export function IRadiusControlCenterEmpty() {
	return (
		<ContentCard>
			<ContentCardSection>
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<ActivityIcon className="size-10 text-muted-foreground/60" />
					<h3 className="mt-3 text-base font-medium">
						iRadius is offline
					</h3>
					<p className="mt-1 max-w-md text-sm text-muted-foreground">
						Could not reach the iRadius MySQL through SSH. Check
						credentials in the org's iRadius settings.
					</p>
				</div>
			</ContentCardSection>
		</ContentCard>
	);
}
