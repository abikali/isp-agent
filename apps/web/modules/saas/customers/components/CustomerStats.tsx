"use client";

import { StatCard, StatCardGroup } from "@shared/components/StatCard";
import {
	CalendarXIcon,
	StickyNoteIcon,
	UserMinusIcon,
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

	return (
		<StatCardGroup columns={6}>
			<StatCard
				title="Total"
				value={stats.total}
				icon={UsersIcon}
				color="blue"
				onClick={() => onStatusChange("all")}
				active={activeStatus === "all"}
			/>
			<StatCard
				title="Online"
				value={stats.online}
				icon={WifiIcon}
				color="green"
				onClick={() => onStatusChange("ONLINE")}
				active={activeStatus === "ONLINE"}
			/>
			<StatCard
				title="Offline"
				value={stats.offline}
				icon={WifiOffIcon}
				color="default"
				onClick={() => onStatusChange("OFFLINE")}
				active={activeStatus === "OFFLINE"}
			/>
			<StatCard
				title="Expired"
				value={stats.expired}
				icon={CalendarXIcon}
				color={stats.expired > 0 ? "red" : "default"}
				onClick={() => onStatusChange("EXPIRED")}
				active={activeStatus === "EXPIRED"}
			/>
			<StatCard
				title="Inactive"
				value={stats.inactive}
				icon={UserMinusIcon}
				color={stats.inactive > 0 ? "amber" : "default"}
				onClick={() => onStatusChange("INACTIVE")}
				active={activeStatus === "INACTIVE"}
			/>
			<StatCard
				title="Needs Review"
				value={stats.needsReview}
				icon={StickyNoteIcon}
				color={stats.needsReview > 0 ? "amber" : "default"}
				onClick={() => onStatusChange("NEEDS_REVIEW")}
				active={activeStatus === "NEEDS_REVIEW"}
			/>
		</StatCardGroup>
	);
}
