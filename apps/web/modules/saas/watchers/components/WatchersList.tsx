"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { MetricCardSkeleton, MetricStrip } from "@shared/components/MetricCard";
import { PageShell } from "@shared/components/PageShell";
import { Button } from "@ui/components/button";
import { EyeIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useWatchers } from "../hooks/use-watchers";
import { CreateWatcherDialog } from "./CreateWatcherDialog";
import { WatcherCard } from "./WatcherCard";
import { WatcherStatsCards } from "./WatcherStatsCards";

export function WatchersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const { watchers } = useWatchers();
	const [showCreate, setShowCreate] = useState(false);

	return (
		<PageShell
			title="Watchers"
			description="Monitor your infrastructure and get notified when something goes down"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="size-4" />
					New watcher
				</Button>
			}
		>
			<AsyncBoundary
				fallback={
					<MetricStrip columns={5}>
						{Array.from({ length: 5 }).map((_, i) => (
							<MetricCardSkeleton key={`stat-${i}`} />
						))}
					</MetricStrip>
				}
			>
				<WatcherStatsCards />
			</AsyncBoundary>

			{watchers.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<EyeIcon className="mb-4 size-12 text-muted-foreground/50" />
					<h3 className="mb-1 text-lg font-medium">
						No watchers yet
					</h3>
					<p className="mb-4 text-sm text-muted-foreground">
						Create your first watcher to start monitoring your
						infrastructure.
					</p>
					<Button onClick={() => setShowCreate(true)}>
						<PlusIcon className="mr-2 size-4" />
						Create Watcher
					</Button>
				</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{watchers.map((watcher) => (
						<WatcherCard
							key={watcher.id}
							watcher={watcher}
							organizationSlug={organizationSlug}
						/>
					))}
				</div>
			)}

			<CreateWatcherDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
		</PageShell>
	);
}
