"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { ClockIcon } from "lucide-react";
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

export function WatcherCard({ watcher, organizationSlug }: WatcherCardProps) {
	const typeDef = WATCHER_TYPES.find((t) => t.value === watcher.type);
	const intervalDef = INTERVAL_OPTIONS.find(
		(i) => i.value === watcher.intervalSeconds,
	);

	return (
		<Link
			to="/app/$organizationSlug/watchers/$watcherId"
			params={{
				organizationSlug,
				watcherId: watcher.id,
			}}
			className="block"
			preload="intent"
		>
			<Card className="transition-colors hover:border-primary/50">
				<CardHeader>
					<div className="flex items-start justify-between">
						<CardTitle className="text-base">
							{watcher.name}
						</CardTitle>
						<WatcherStatusBadge
							status={
								watcher.enabled ? watcher.status : "unknown"
							}
						/>
					</div>
					<CardDescription className="truncate">
						{watcher.target}
					</CardDescription>
					<div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
						<Badge variant="outline" className="text-[10px]">
							{typeDef?.label ?? watcher.type}
						</Badge>
						<span className="flex items-center gap-1">
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
				</CardHeader>
			</Card>
		</Link>
	);
}
