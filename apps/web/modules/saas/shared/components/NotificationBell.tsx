"use client";

import { useRouter } from "@shared/hooks/router";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	AlertCircleIcon,
	AlertTriangleIcon,
	BellIcon,
	BellOffIcon,
	CheckCircleIcon,
	CheckIcon,
	InfoIcon,
	SettingsIcon,
	Trash2Icon,
} from "lucide-react";
import type { Notification } from "../lib/types";

function getTimeAgo(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) {
		return "Just now";
	}
	if (minutes < 60) {
		return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
	}
	if (hours < 24) {
		return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	}
	return `${days} day${days > 1 ? "s" : ""} ago`;
}

function NotificationIcon({ type }: { type: string }) {
	switch (type) {
		case "success":
			return <CheckCircleIcon className="size-4 text-green-500" />;
		case "warning":
			return <AlertTriangleIcon className="size-4 text-yellow-500" />;
		case "error":
			return <AlertCircleIcon className="size-4 text-red-500" />;
		default:
			return <InfoIcon className="size-4 text-blue-500" />;
	}
}

export function NotificationBell() {
	const router = useRouter();
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		...orpc.notifications.list.queryOptions({
			input: {
				limit: 10,
				offset: 0,
			},
		}),
		refetchInterval: 30000, // Poll every 30 seconds for near-real-time updates
	});

	const markAsReadMutation = useMutation(
		orpc.notifications.markAsRead.mutationOptions(),
	);
	const markAllAsReadMutation = useMutation(
		orpc.notifications.markAllAsRead.mutationOptions(),
	);
	const deleteMutation = useMutation(
		orpc.notifications.delete.mutationOptions(),
	);
	const deleteAllReadMutation = useMutation(
		orpc.notifications.deleteAllRead.mutationOptions(),
	);

	const handleMarkAsRead = async (id: string) => {
		await markAsReadMutation.mutateAsync({ id });
		queryClient.invalidateQueries({
			queryKey: orpc.notifications.list.key(),
		});
	};

	const handleMarkAllAsRead = async () => {
		await markAllAsReadMutation.mutateAsync({});
		queryClient.invalidateQueries({
			queryKey: orpc.notifications.list.key(),
		});
	};

	const handleDelete = async (id: string) => {
		await deleteMutation.mutateAsync({ id });
		queryClient.invalidateQueries({
			queryKey: orpc.notifications.list.key(),
		});
	};

	const handleClearRead = async () => {
		await deleteAllReadMutation.mutateAsync({});
		queryClient.invalidateQueries({
			queryKey: orpc.notifications.list.key(),
		});
	};

	const unreadCount = data?.unreadCount ?? 0;
	const notifications = data?.notifications ?? [];
	const hasReadNotifications = notifications.some(
		(n: Notification) => n.read,
	);

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative"
					aria-label="Notifications"
				>
					<BellIcon className="size-5" />
					{unreadCount > 0 && (
						<Badge
							variant="destructive"
							className="absolute -top-1 -right-1 flex size-5 items-center justify-center p-0 text-xs"
						>
							{unreadCount > 9 ? "9+" : unreadCount}
						</Badge>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-[calc(100vw-2rem)] sm:w-80"
			>
				<DropdownMenuLabel className="flex items-center justify-between">
					<span>Notifications</span>
					{unreadCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="h-auto p-1 text-xs"
							onClick={handleMarkAllAsRead}
						>
							<CheckIcon className="mr-1 size-3" />
							Mark all read
						</Button>
					)}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				{isLoading ? (
					<div className="py-6 text-center text-muted-foreground text-sm">
						Loading...
					</div>
				) : notifications.length === 0 ? (
					<div className="py-8 text-center">
						<BellOffIcon className="mx-auto mb-2 size-8 text-muted-foreground/50" />
						<p className="font-medium text-muted-foreground text-sm">
							All caught up!
						</p>
						<p className="mt-1 text-muted-foreground/70 text-xs">
							No notifications to show
						</p>
					</div>
				) : (
					<div className="max-h-80 overflow-y-auto">
						{notifications.map((notification: Notification) => (
							<DropdownMenuItem
								key={notification.id}
								className="flex cursor-pointer flex-col items-start gap-1 p-3"
								onClick={() => {
									if (!notification.read) {
										handleMarkAsRead(notification.id);
									}
									if (notification.link) {
										// Use router.push for safe navigation (prevents javascript: protocol)
										// Only allows relative URLs and same-origin navigation
										if (notification.link.startsWith("/")) {
											router.push(notification.link);
										}
									}
								}}
							>
								<div className="flex w-full items-start gap-2">
									<NotificationIcon
										type={notification.type}
									/>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span
												className={`font-medium text-sm ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}
											>
												{notification.title}
											</span>
											{!notification.read && (
												<span className="size-2 rounded-full bg-primary" />
											)}
										</div>
										<p className="line-clamp-2 text-muted-foreground text-xs">
											{notification.message}
										</p>
										<span className="mt-1 text-muted-foreground text-xs">
											{getTimeAgo(notification.createdAt)}
										</span>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 shrink-0"
										onClick={(e) => {
											e.stopPropagation();
											handleDelete(notification.id);
										}}
									>
										<Trash2Icon className="size-3" />
									</Button>
								</div>
							</DropdownMenuItem>
						))}
					</div>
				)}

				<DropdownMenuSeparator />
				<div className="flex items-center justify-between p-2">
					<Button
						variant="ghost"
						size="sm"
						asChild
						className="h-auto px-2 py-1 text-xs"
					>
						<Link to="/app/settings/notifications">
							<SettingsIcon className="mr-1 size-3" />
							Settings
						</Link>
					</Button>
					{hasReadNotifications && (
						<Button
							variant="ghost"
							size="sm"
							className="h-auto px-2 py-1 text-xs"
							onClick={handleClearRead}
						>
							Clear read
						</Button>
					)}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
