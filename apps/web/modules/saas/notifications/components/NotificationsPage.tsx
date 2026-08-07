"use client";

import {
	ContentCard,
	ContentCardFooter,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { formatDate } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/toggle-group";
import { cn } from "@ui/lib";
import {
	AlertCircleIcon,
	AlertTriangleIcon,
	BellIcon,
	BellOffIcon,
	CheckIcon,
	InfoIcon,
	Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type FilterValue = "all" | "unread";

const ICONS: Record<string, ReactNode> = {
	success: <CheckIcon className="size-4 text-success" />,
	warning: <AlertTriangleIcon className="size-4 text-warning" />,
	error: <AlertCircleIcon className="size-4 text-destructive" />,
	info: <InfoIcon className="size-4 text-info" />,
};

// Hoisted locale-default date formatter — same output as the zero-arg
// toLocaleDateString(), without building a new Intl formatter per render.

function relativeTime(date: Date): string {
	const diff = Date.now() - new Date(date).getTime();
	const min = Math.floor(diff / 60000);
	if (min < 1) {
		return "Just now";
	}
	if (min < 60) {
		return `${min}m ago`;
	}
	const hr = Math.floor(min / 60);
	if (hr < 24) {
		return `${hr}h ago`;
	}
	const day = Math.floor(hr / 24);
	if (day < 30) {
		return `${day}d ago`;
	}
	return formatDate(date);
}

export function NotificationsPage() {
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<FilterValue>("all");

	const { data } = useSuspenseQuery(
		orpc.notifications.list.queryOptions({
			input: {
				limit: 100,
				offset: 0,
				unreadOnly: filter === "unread",
			},
		}),
	);
	const notifications = data?.notifications ?? [];
	const unreadCount = data?.unreadCount ?? 0;

	const markAllAsRead = useMutation({
		...orpc.notifications.markAllAsRead.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.notifications.key(),
			});
		},
	});
	const markAsRead = useMutation({
		...orpc.notifications.markAsRead.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.notifications.key(),
			});
		},
	});
	const deleteNotification = useMutation({
		...orpc.notifications.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.notifications.key(),
			});
		},
	});
	const deleteAllRead = useMutation({
		...orpc.notifications.deleteAllRead.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.notifications.key(),
			});
		},
	});

	const grouped = useMemo(() => {
		const items = data?.notifications ?? [];
		const today: typeof items = [];
		const yesterday: typeof items = [];
		const older: typeof items = [];
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const yesterdayStart = new Date(todayStart);
		yesterdayStart.setDate(yesterdayStart.getDate() - 1);
		for (const n of items) {
			const created = new Date(n.createdAt).getTime();
			if (created >= todayStart.getTime()) {
				today.push(n);
			} else if (created >= yesterdayStart.getTime()) {
				yesterday.push(n);
			} else {
				older.push(n);
			}
		}
		return { today, yesterday, older };
	}, [data]);

	return (
		<PageShell
			title="Notifications"
			description={
				unreadCount > 0
					? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
					: "You're all caught up."
			}
			actions={
				<>
					{unreadCount > 0 && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => markAllAsRead.mutate({})}
							loading={markAllAsRead.isPending}
						>
							<CheckIcon className="mr-1.5 size-3.5" />
							Mark all read
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => deleteAllRead.mutate({})}
						loading={deleteAllRead.isPending}
					>
						<Trash2Icon className="mr-1.5 size-3.5" />
						Clear read
					</Button>
				</>
			}
		>
			<ContentCard>
				<ContentCardToolbar>
					<ToggleGroup
						type="single"
						value={filter}
						onValueChange={(v) => {
							if (v) {
								setFilter(v as FilterValue);
							}
						}}
						size="sm"
					>
						<ToggleGroupItem value="all">All</ToggleGroupItem>
						<ToggleGroupItem value="unread">
							Unread
							{unreadCount > 0 && (
								<Badge variant="secondary" className="ml-1.5">
									{unreadCount}
								</Badge>
							)}
						</ToggleGroupItem>
					</ToggleGroup>
				</ContentCardToolbar>

				{notifications.length === 0 ? (
					<div className="p-8">
						<EmptyState
							icon={filter === "unread" ? BellOffIcon : BellIcon}
							title={
								filter === "unread"
									? "No unread notifications"
									: "You're all caught up"
							}
							description="When something happens — an escalation, a watcher failure, a flagged payment — it'll show up here."
						/>
					</div>
				) : (
					<div className="divide-y divide-border">
						{grouped.today.length > 0 && (
							<NotificationGroup
								label="Today"
								items={grouped.today}
								onItemClick={(id) => markAsRead.mutate({ id })}
								onDelete={(id) =>
									deleteNotification.mutate({ id })
								}
							/>
						)}
						{grouped.yesterday.length > 0 && (
							<NotificationGroup
								label="Yesterday"
								items={grouped.yesterday}
								onItemClick={(id) => markAsRead.mutate({ id })}
								onDelete={(id) =>
									deleteNotification.mutate({ id })
								}
							/>
						)}
						{grouped.older.length > 0 && (
							<NotificationGroup
								label="Earlier"
								items={grouped.older}
								onItemClick={(id) => markAsRead.mutate({ id })}
								onDelete={(id) =>
									deleteNotification.mutate({ id })
								}
							/>
						)}
					</div>
				)}

				{notifications.length > 0 && (
					<ContentCardFooter>
						<span>
							{notifications.length}{" "}
							{notifications.length === 1
								? "notification"
								: "notifications"}
							{filter === "unread" && " unread"}
						</span>
					</ContentCardFooter>
				)}
			</ContentCard>
		</PageShell>
	);
}

interface NotificationGroupProps {
	label: string;
	items: Array<{
		id: string;
		type: string;
		title: string;
		message: string;
		link: string | null;
		read: boolean;
		createdAt: Date | string;
	}>;
	onItemClick: (id: string) => void;
	onDelete: (id: string) => void;
}

function NotificationGroup({
	label,
	items,
	onItemClick,
	onDelete,
}: NotificationGroupProps) {
	return (
		<div>
			<div className="bg-surface-subtle/40 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<ul className="divide-y divide-border">
				{items.map((n) => (
					<li
						key={n.id}
						className={cn(
							"group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
							!n.read && "bg-info/[0.03]",
						)}
					>
						<div className="mt-0.5 shrink-0">
							{ICONS[n.type] ?? ICONS["info"]}
						</div>
						<div className="min-w-0 flex-1">
							{n.link ? (
								<Link
									to={n.link}
									preload="intent"
									onClick={() => {
										if (!n.read) {
											onItemClick(n.id);
										}
									}}
									className="block focus-visible:outline-none"
								>
									<NotificationBody
										title={n.title}
										message={n.message}
										unread={!n.read}
										timestamp={n.createdAt}
									/>
								</Link>
							) : (
								<NotificationBody
									title={n.title}
									message={n.message}
									unread={!n.read}
									timestamp={n.createdAt}
								/>
							)}
						</div>
						<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							{!n.read && (
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => onItemClick(n.id)}
								>
									<CheckIcon className="size-3.5" />
								</Button>
							)}
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
								onClick={() => onDelete(n.id)}
							>
								<Trash2Icon className="size-3.5" />
							</Button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function NotificationBody({
	title,
	message,
	unread,
	timestamp,
}: {
	title: string;
	message: string;
	unread: boolean;
	timestamp: Date | string;
}) {
	return (
		<>
			<div className="flex items-baseline gap-2">
				<span
					className={cn(
						"truncate text-sm",
						unread
							? "font-medium text-foreground"
							: "text-foreground",
					)}
				>
					{title}
				</span>
				{unread && (
					<span
						className="size-1.5 shrink-0 rounded-full bg-info"
						aria-hidden
					/>
				)}
				<span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
					{relativeTime(new Date(timestamp))}
				</span>
			</div>
			<p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
				{message}
			</p>
		</>
	);
}
