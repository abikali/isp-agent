"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
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
		<div>
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Watchers</h1>
					<p className="text-muted-foreground">
						Monitor your infrastructure and get notified when
						something goes down
					</p>
				</div>
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Watcher
				</Button>
			</div>

			<div className="mb-6">
				<AsyncBoundary
					fallback={
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{Array.from({ length: 4 }).map((_, i) => (
								<Skeleton
									key={`stat-${i}`}
									className="h-24 rounded-lg"
								/>
							))}
						</div>
					}
				>
					<WatcherStatsCards />
				</AsyncBoundary>
			</div>

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
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
		</div>
	);
}
