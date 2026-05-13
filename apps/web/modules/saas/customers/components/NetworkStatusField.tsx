"use client";

import { StatusIndicator } from "@shared/components/StatusIndicator";
import { Skeleton } from "@ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { useCustomerNetworkStatus } from "../hooks/use-customers";

interface NetworkStatusFieldProps {
	label: string;
	name: string | null | undefined;
	customerId: string;
	kind: "station" | "accessPoint";
}

/**
 * Renders a labelled read-only field for a customer's station or access
 * point along with a live online/offline badge. The badge is sourced from
 * `useCustomerNetworkStatus`, which polls every 15s — matching the cadence
 * of the background `syncNetworkMonitor` worker that keeps our local
 * station/AP rows in sync with iRadius.
 *
 * Visual states:
 *   - first load (no cached data): skeleton in place of the badge
 *   - refetching with previous data: existing badge stays put (no flicker)
 *   - missing link (no station/AP on the customer): renders `—`
 *
 * Designed to slot into the existing `FieldGroup` columns layout used
 * elsewhere on the customer edit form, so the label/value styling matches
 * the surrounding `ReadOnlyField` instances.
 */
export function NetworkStatusField({
	label,
	name,
	customerId,
	kind,
}: NetworkStatusFieldProps) {
	const { station, accessPoint, isLoading } =
		useCustomerNetworkStatus(customerId);
	const live = kind === "station" ? station : accessPoint;

	// No linked station/AP → render the same empty-state as ReadOnlyField.
	if (!name) {
		return (
			<div className="space-y-1.5">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</p>
				<p className="text-sm text-muted-foreground/60">—</p>
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<p className="text-sm">{name}</p>
				{isLoading && !live ? (
					<Skeleton className="h-5 w-16 rounded-full" />
				) : live ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span>
								<StatusIndicator
									status={live.online ? "online" : "offline"}
									variant="badge"
									size="sm"
								/>
							</span>
						</TooltipTrigger>
						<TooltipContent>
							{liveTooltip(live, kind)}
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		</div>
	);
}

function liveTooltip(
	live: { online: boolean; uptime?: string | null; signal?: string | null },
	kind: "station" | "accessPoint",
): string {
	const lines: string[] = [
		`Live from iRadius — ${live.online ? "online" : "offline"}`,
	];
	if (live.uptime) {
		lines.push(`Uptime: ${live.uptime}`);
	}
	if (kind === "accessPoint" && live.signal) {
		lines.push(`Signal: ${live.signal}`);
	}
	return lines.join(" · ");
}
