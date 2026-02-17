"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { useRouter } from "@shared/hooks/router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	ArrowLeftIcon,
	BellIcon,
	MailIcon,
	MessageSquareIcon,
	PencilIcon,
	PlayIcon,
	PowerIcon,
	TrashIcon,
} from "lucide-react";
import { useState } from "react";
import {
	useDeleteWatcher,
	useRunWatcherNow,
	useToggleWatcher,
	useUpdateWatcher,
	useWatcher,
} from "../hooks/use-watchers";
import { INTERVAL_OPTIONS, WATCHER_TYPES } from "../lib/constants";
import { ExecutionHistory } from "./ExecutionHistory";
import {
	type NotificationConfig,
	NotificationSettings,
	toApiNotificationConfig,
} from "./NotificationSettings";
import { WatcherStatusBadge } from "./WatcherStatusBadge";

function formatTime(date: string | Date | null): string {
	if (!date) {
		return "Never";
	}
	return new Date(date).toLocaleString();
}

export function WatcherDetail({
	watcherId,
	organizationSlug,
}: {
	watcherId: string;
	organizationSlug: string;
}) {
	const { watcher } = useWatcher(watcherId);
	const toggleWatcher = useToggleWatcher();
	const deleteWatcher = useDeleteWatcher();
	const updateWatcher = useUpdateWatcher();
	const runNow = useRunWatcherNow();
	const router = useRouter();
	const [editingNotifications, setEditingNotifications] = useState(false);
	const [notifConfig, setNotifConfig] = useState<NotificationConfig | null>(
		null,
	);

	if (!watcher) {
		return null;
	}

	const typeDef = WATCHER_TYPES.find((t) => t.value === watcher.type);
	const intervalDef = INTERVAL_OPTIONS.find(
		(i) => i.value === watcher.intervalSeconds,
	);

	async function handleDelete() {
		if (!watcher) {
			return;
		}
		await deleteWatcher.mutateAsync({
			organizationId: watcher.organizationId,
			watcherId: watcher.id,
		});
		router.navigate({
			to: "/app/$organizationSlug/watchers",
			params: { organizationSlug },
		});
	}

	async function handleToggle() {
		if (!watcher) {
			return;
		}
		await toggleWatcher.mutateAsync({
			organizationId: watcher.organizationId,
			watcherId: watcher.id,
			enabled: !watcher.enabled,
		});
	}

	async function handleRunNow() {
		if (!watcher) {
			return;
		}
		await runNow.mutateAsync({
			organizationId: watcher.organizationId,
			watcherId: watcher.id,
		});
	}

	return (
		<div>
			<div className="mb-6">
				<Button
					variant="ghost"
					size="sm"
					onClick={() =>
						router.navigate({
							to: "/app/$organizationSlug/watchers",
							params: { organizationSlug },
						})
					}
				>
					<ArrowLeftIcon className="mr-2 size-4" />
					Back to Watchers
				</Button>
			</div>

			<div className="mb-6 flex items-start justify-between">
				<div>
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold">{watcher.name}</h1>
						<WatcherStatusBadge
							status={
								watcher.enabled ? watcher.status : "unknown"
							}
						/>
					</div>
					<p className="mt-1 text-muted-foreground">
						{watcher.target}
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleRunNow}
						disabled={runNow.isPending}
					>
						<PlayIcon className="mr-2 size-4" />
						{runNow.isPending ? "Running..." : "Run Now"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleToggle}
						disabled={toggleWatcher.isPending}
					>
						<PowerIcon className="mr-2 size-4" />
						{watcher.enabled ? "Disable" : "Enable"}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={handleDelete}
						disabled={deleteWatcher.isPending}
					>
						<TrashIcon className="mr-2 size-4" />
						Delete
					</Button>
				</div>
			</div>

			<div className="mb-6 grid gap-4 sm:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium">
							Configuration
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Type</span>
							<Badge variant="outline">
								{typeDef?.label ?? watcher.type}
							</Badge>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Interval
							</span>
							<span>
								{intervalDef?.label ??
									`${watcher.intervalSeconds}s`}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Enabled
							</span>
							<span>{watcher.enabled ? "Yes" : "No"}</span>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-sm font-medium">
							Status
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Current Status
							</span>
							<WatcherStatusBadge status={watcher.status} />
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Last Checked
							</span>
							<span>{formatTime(watcher.lastCheckedAt)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Last Status Change
							</span>
							<span>{formatTime(watcher.lastStatusChange)}</span>
						</div>
					</CardContent>
				</Card>
			</div>

			<NotificationSettingsCard
				watcher={watcher}
				editing={editingNotifications}
				onEditToggle={() => {
					if (!editingNotifications) {
						const existing =
							watcher.notificationConfig as NotificationConfig | null;
						setNotifConfig(
							existing ?? {
								channels: [],
								events: {
									down: true,
									recovery: true,
									reminder: false,
								},
							},
						);
					}
					setEditingNotifications(!editingNotifications);
				}}
				notifConfig={notifConfig}
				onNotifConfigChange={setNotifConfig}
				onSave={async () => {
					await updateWatcher.mutateAsync({
						organizationId: watcher.organizationId,
						watcherId: watcher.id,
						notificationConfig: notifConfig
							? toApiNotificationConfig(notifConfig)
							: undefined,
					});
					setEditingNotifications(false);
				}}
				isSaving={updateWatcher.isPending}
			/>

			<Card>
				<CardHeader>
					<CardTitle>Recent Executions</CardTitle>
					<CardDescription>
						Last 50 check results for this watcher
					</CardDescription>
				</CardHeader>
				<CardContent>
					<AsyncBoundary
						fallback={<Skeleton className="h-32 w-full" />}
					>
						<ExecutionHistory watcherId={watcherId} />
					</AsyncBoundary>
				</CardContent>
			</Card>
		</div>
	);
}

function NotificationSettingsCard({
	watcher,
	editing,
	onEditToggle,
	notifConfig,
	onNotifConfigChange,
	onSave,
	isSaving,
}: {
	watcher: { notificationConfig: unknown };
	editing: boolean;
	onEditToggle: () => void;
	notifConfig: NotificationConfig | null;
	onNotifConfigChange: (config: NotificationConfig) => void;
	onSave: () => void;
	isSaving: boolean;
}) {
	const config = watcher.notificationConfig as NotificationConfig | null;

	return (
		<Card className="mb-6">
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle className="text-sm font-medium">
						Notification Settings
					</CardTitle>
					<CardDescription>
						Configure how you get alerted when this watcher detects
						issues
					</CardDescription>
				</div>
				<Button variant="outline" size="sm" onClick={onEditToggle}>
					{editing ? (
						"Cancel"
					) : (
						<>
							<PencilIcon className="mr-2 size-4" />
							Edit
						</>
					)}
				</Button>
			</CardHeader>
			<CardContent>
				{editing && notifConfig ? (
					<div className="space-y-4">
						<NotificationSettings
							value={notifConfig}
							onChange={onNotifConfigChange}
						/>
						<Button size="sm" onClick={onSave} disabled={isSaving}>
							{isSaving ? "Saving..." : "Save"}
						</Button>
					</div>
				) : config && config.channels.length > 0 ? (
					<div className="space-y-3 text-sm">
						<div>
							<span className="font-medium">Events: </span>
							{[
								config.events.down && "Down",
								config.events.recovery && "Recovery",
								config.events.reminder && "Reminders",
							]
								.filter(Boolean)
								.join(", ") || "None"}
						</div>
						<div className="space-y-1">
							<span className="font-medium">Channels:</span>
							{config.channels.map((ch, i) => (
								<div
									key={`${ch.type}-${i}`}
									className="flex items-center gap-2 pl-2 text-muted-foreground"
								>
									{ch.type === "email" ? (
										<MailIcon className="size-3" />
									) : (
										<MessageSquareIcon className="size-3" />
									)}
									<span className="capitalize">
										{ch.type}
									</span>
									{ch.type === "email" && ch.email && (
										<span>- {ch.email}</span>
									)}
									{ch.type !== "email" && ch.chatId && (
										<span>- {ch.chatId}</span>
									)}
									{!ch.enabled && (
										<span className="text-xs">
											(disabled)
										</span>
									)}
								</div>
							))}
						</div>
					</div>
				) : (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<BellIcon className="size-4" />
						Using organization-wide notifications (default)
					</div>
				)}
			</CardContent>
		</Card>
	);
}
