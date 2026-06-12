"use client";

import { formatDate } from "@shared/lib/format";
import { Card, CardContent } from "@ui/components/card";
import { HardHatIcon } from "lucide-react";
import { useWorkerWorkload } from "../hooks/use-field-work";

export function WorkerWorkloadCards() {
	const { workers } = useWorkerWorkload();

	if (workers.length === 0) {
		return null;
	}

	return (
		<div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{workers.slice(0, 8).map((worker) => (
				<Card key={worker.employeeId}>
					<CardContent className="p-4">
						<div className="flex items-center gap-2">
							<HardHatIcon className="size-4 text-muted-foreground" />
							<p className="truncate text-sm font-medium">
								{worker.name}
							</p>
						</div>
						<div className="mt-2 flex items-baseline gap-3">
							<span className="text-2xl font-semibold tabular-nums">
								{worker.openCount}
							</span>
							<span className="text-xs text-muted-foreground">
								open task{worker.openCount === 1 ? "" : "s"}
							</span>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{worker.completedThisMonth} done this month
							{worker.oldestAssignedAt &&
								` · oldest ${formatDate(worker.oldestAssignedAt, { dateStyle: "medium" })}`}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
