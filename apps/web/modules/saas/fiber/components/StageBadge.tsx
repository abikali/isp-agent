import {
	FIBER_STAGE_LABELS,
	type FiberStage,
} from "@repo/api/modules/fiber/lib/constants";
import { cn } from "@ui/lib";

const STAGE_TONE: Record<FiberStage, string> = {
	NEW: "bg-info/15 text-info",
	CONTACTED: "bg-muted text-foreground",
	INTERESTED: "bg-warning/15 text-warning",
	BOX_CHECK: "bg-warning/15 text-warning",
	SUBMITTED: "bg-chart-4/15 text-chart-4",
	INSTALLING: "bg-chart-4/15 text-chart-4",
	WON: "bg-success/15 text-success",
	LOST: "bg-muted text-muted-foreground line-through",
};

export function StageBadge({ stage }: { stage: FiberStage }) {
	return (
		<span
			className={cn(
				"rounded px-1.5 py-0.5 text-[11px] font-medium",
				STAGE_TONE[stage] ?? "bg-muted",
			)}
		>
			{FIBER_STAGE_LABELS[stage] ?? stage}
		</span>
	);
}
