"use client";

import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { formatCurrency } from "@shared/lib/format";
import {
	BanknoteIcon,
	CalendarXIcon,
	OctagonXIcon,
	StickyNoteIcon,
	UserCheckIcon,
	UsersIcon,
	WifiIcon,
	WifiOffIcon,
} from "lucide-react";
import { useCustomerStats } from "../hooks/use-customers";

interface CustomerStatsProps {
	activeStatus: string;
	onStatusChange: (value: string) => void;
}

export function CustomerStats({
	activeStatus,
	onStatusChange,
}: CustomerStatsProps) {
	const stats = useCustomerStats();
	const activeRate =
		stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

	return (
		<MetricStrip columns={8}>
			<MetricCard
				label="Total"
				value={stats.total}
				icon={UsersIcon}
				tone="info"
				onClick={() => onStatusChange("all")}
				active={activeStatus === "all"}
			/>
			<MetricCard
				label="Online"
				value={stats.online}
				icon={WifiIcon}
				tone="success"
				hint={
					stats.online + stats.offline > 0
						? `${Math.round((stats.online / (stats.online + stats.offline)) * 100)}%`
						: undefined
				}
				onClick={() => onStatusChange("ONLINE")}
				active={activeStatus === "ONLINE"}
			/>
			<MetricCard
				label="Offline"
				value={stats.offline}
				icon={WifiOffIcon}
				onClick={() => onStatusChange("OFFLINE")}
				active={activeStatus === "OFFLINE"}
			/>
			<MetricCard
				label="Active"
				value={stats.active}
				icon={UserCheckIcon}
				tone="success"
				hint={`${activeRate}%`}
				onClick={() => onStatusChange("ACTIVE")}
				active={activeStatus === "ACTIVE"}
			/>
			<MetricCard
				label="Expired"
				value={stats.expired}
				icon={CalendarXIcon}
				tone={stats.expired > 0 ? "warning" : "default"}
				onClick={() => onStatusChange("EXPIRED")}
				active={activeStatus === "EXPIRED"}
			/>
			<MetricCard
				label="Stopped"
				value={stats.inactive}
				icon={OctagonXIcon}
				tone={stats.inactive > 0 ? "danger" : "default"}
				onClick={() => onStatusChange("INACTIVE")}
				active={activeStatus === "INACTIVE"}
			/>
			<MetricCard
				label="Needs review"
				value={stats.needsReview}
				icon={StickyNoteIcon}
				tone={stats.needsReview > 0 ? "warning" : "default"}
				onClick={() => onStatusChange("NEEDS_REVIEW")}
				active={activeStatus === "NEEDS_REVIEW"}
			/>
			<MetricCard
				label="Monthly revenue"
				value={formatCurrency(stats.totalMonthlyRevenue)}
				icon={BanknoteIcon}
				tone="info"
				hint="From active plans"
			/>
		</MetricStrip>
	);
}
