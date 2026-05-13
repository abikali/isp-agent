"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { cn } from "@ui/lib";
import {
	BanknoteIcon,
	ClockIcon,
	FileTextIcon,
	HistoryIcon,
	type LucideIcon,
	MapPinIcon,
	ShieldIcon,
	SquareCheckIcon,
} from "lucide-react";

interface CustomerActivityTimelineProps {
	customerId: string;
	limit?: number;
}

const TYPE_META: Record<
	string,
	{ icon: LucideIcon; tone: string; label: string }
> = {
	payment: {
		icon: BanknoteIcon,
		tone: "text-success bg-success/10",
		label: "Payment",
	},
	invoice: {
		icon: FileTextIcon,
		tone: "text-info bg-info/10",
		label: "Invoice",
	},
	location_request: {
		icon: MapPinIcon,
		tone: "text-chart-4 bg-chart-4/10",
		label: "Location",
	},
	task: {
		icon: SquareCheckIcon,
		tone: "text-chart-5 bg-chart-5/10",
		label: "Task",
	},
	audit: {
		icon: ShieldIcon,
		tone: "text-muted-foreground bg-muted",
		label: "Audit",
	},
};

export function CustomerActivityTimeline({
	customerId,
	limit = 40,
}: CustomerActivityTimelineProps) {
	const organizationId = useOrganizationId();
	if (!organizationId) {
		return null;
	}
	return (
		<Inner
			organizationId={organizationId}
			customerId={customerId}
			limit={limit}
		/>
	);
}

function Inner({
	organizationId,
	customerId,
	limit,
}: {
	organizationId: string;
	customerId: string;
	limit: number;
}) {
	const { data } = useSuspenseQuery(
		orpc.customers.activity.queryOptions({
			input: { organizationId, customerId, limit },
		}),
	);

	if (!data.items.length) {
		return (
			<EmptyState
				icon={HistoryIcon}
				title="No activity yet"
				description="Payments, invoices, location requests, and tasks will show up here once recorded."
			/>
		);
	}

	return (
		<div className="space-y-0.5">
			{data.items.map((item) => {
				const meta = TYPE_META[item.type] ?? TYPE_META["audit"];
				if (!meta) {
					return null;
				}
				const Icon = meta.icon;
				return (
					<div
						key={`${item.type}-${item.id}`}
						className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/40"
					>
						<div
							className={cn(
								"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md",
								meta.tone,
							)}
						>
							<Icon className="size-3.5" />
						</div>
						<div className="min-w-0 flex-1 space-y-0.5">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<div className="flex items-center gap-2 text-sm">
									<span className="font-medium">
										{item.title}
									</span>
									<Badge
										variant="outline"
										className="text-[10px] capitalize"
									>
										{meta.label}
									</Badge>
								</div>
								<span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
									<ClockIcon className="size-3" />
									{formatDate(item.occurredAt)}
								</span>
							</div>
							{(item.detail || item.actor) && (
								<p className="truncate text-xs text-muted-foreground">
									{item.detail}
									{item.detail && item.actor ? " · " : ""}
									{item.actor && `by ${item.actor}`}
								</p>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
