"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Card } from "@ui/components/card";
import { cn } from "@ui/lib";
import { ClockIcon, EyeIcon } from "lucide-react";
import { INTERVAL_OPTIONS, WATCHER_TYPES } from "../lib/constants";
import { WatcherStatusBadge } from "./WatcherStatusBadge";

interface WatcherCardProps {
	watcher: {
		id: string;
		name: string;
		type: string;
		target: string;
		intervalSeconds: number;
		enabled: boolean;
		status: string;
		lastCheckedAt: Date | null;
	};
	organizationSlug: string;
}

const STATUS_RING: Record<string, string> = {
	up: "bg-success/12 text-success",
	down: "bg-destructive/12 text-destructive",
	unknown: "bg-muted text-muted-foreground",
};

export function WatcherCard({ watcher, organizationSlug }: WatcherCardProps) {
	const typeDef = WATCHER_TYPES.find((t) => t.value === watcher.type);
	const intervalDef = INTERVAL_OPTIONS.find(
		(i) => i.value === watcher.intervalSeconds,
	);
	const status = watcher.enabled ? watcher.status : "unknown";

	return (
		<Link
			to="/app/$organizationSlug/watchers/$watcherId"
			params={{
				organizationSlug,
				watcherId: watcher.id,
			}}
			className="group block"
			preload="intent"
		>
			<Card className="h-full transition-[transform,border-color,box-shadow] hover:-translate-y-px hover:border-border-strong hover:shadow-sm">
				<div className="space-y-2.5 p-3.5">
					<div className="flex items-start justify-between gap-2">
						<div className="flex min-w-0 items-center gap-2.5">
							<div
								className={cn(
									"flex size-8 shrink-0 items-center justify-center rounded-md",
									STATUS_RING[status] ??
										STATUS_RING["unknown"],
								)}
							>
								<EyeIcon className="size-3.5" />
							</div>
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">
									{watcher.name}
								</div>
								<div className="truncate font-mono text-[11px] text-muted-foreground">
									{watcher.target}
								</div>
							</div>
						</div>
						<WatcherStatusBadge status={status} />
					</div>
					<div className="flex items-center gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
						<Badge variant="outline" className="text-[10px]">
							{typeDef?.label ?? watcher.type}
						</Badge>
						<span className="flex items-center gap-1 tabular-nums">
							<ClockIcon className="size-3" />
							{intervalDef?.label ??
								`${watcher.intervalSeconds}s`}
						</span>
						{!watcher.enabled && (
							<Badge variant="secondary" className="text-[10px]">
								Disabled
							</Badge>
						)}
					</div>
				</div>
			</Card>
		</Link>
	);
}
