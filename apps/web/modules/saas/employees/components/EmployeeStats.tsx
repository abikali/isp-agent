"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { StatusPieChart } from "@shared/components/StatusPieChart";
import { Progress } from "@ui/components/progress";
import {
	BuildingIcon,
	ClockIcon,
	PercentIcon,
	TrophyIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useEmployeeStats } from "../hooks/use-employees";

const STATUS_COLORS: Record<string, string> = {
	Active: "var(--chart-2)",
	"On Leave": "var(--chart-3)",
	Inactive: "var(--chart-1)",
};

const DEPARTMENT_LABELS: Record<string, string> = {
	TECHNICAL: "Technical",
	CUSTOMER_SERVICE: "Customer Service",
	BILLING: "Billing",
	MANAGEMENT: "Management",
	FIELD_OPS: "Field Ops",
};

export function EmployeeStats() {
	const stats = useEmployeeStats();

	const statusData = [
		{ name: "Active", value: stats.active },
		{ name: "On Leave", value: stats.onLeave },
		{ name: "Inactive", value: stats.inactive },
	].filter((d) => d.value > 0);

	const activeRate =
		stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0;

	const departmentData = (stats.departmentBreakdown ?? []).map((d) => ({
		name: DEPARTMENT_LABELS[d.department ?? ""] ?? d.department ?? "Other",
		value: d.count,
	}));

	const topCollectors = stats.topCollectors ?? [];

	return (
		<div className="space-y-4">
			<MetricStrip columns={5}>
				<MetricCard
					label="Total"
					value={stats.total}
					icon={UsersIcon}
					tone="info"
				/>
				<MetricCard
					label="Active"
					value={stats.active}
					icon={UserCheckIcon}
					tone="success"
				/>
				<MetricCard
					label="On leave"
					value={stats.onLeave}
					icon={ClockIcon}
					tone={stats.onLeave > 0 ? "warning" : "default"}
				/>
				<MetricCard
					label="Inactive"
					value={stats.inactive}
					icon={UserMinusIcon}
					tone={stats.inactive > 0 ? "default" : "default"}
				/>
				<MetricCard
					label="Active rate"
					value={`${activeRate}%`}
					icon={PercentIcon}
					tone={activeRate >= 80 ? "success" : "warning"}
				/>
			</MetricStrip>

			{stats.total > 0 && (
				<div className="grid gap-4 lg:grid-cols-3">
					{statusData.length > 1 && (
						<ContentCard>
							<ContentCardSection className="border-b border-border">
								<div className="flex items-center gap-2">
									<UsersIcon className="size-3.5 text-muted-foreground" />
									<div className="text-sm font-medium">
										Status
									</div>
								</div>
							</ContentCardSection>
							<ContentCardSection>
								<StatusPieChart
									title=""
									data={statusData}
									colorMap={STATUS_COLORS}
									size="sm"
									footer={`${activeRate}% active`}
								/>
							</ContentCardSection>
						</ContentCard>
					)}

					{departmentData.length > 0 && (
						<ContentCard>
							<ContentCardSection className="border-b border-border">
								<div className="flex items-center gap-2">
									<BuildingIcon className="size-3.5 text-muted-foreground" />
									<div className="text-sm font-medium">
										By department
									</div>
								</div>
							</ContentCardSection>
							<ContentCardSection>
								<div className="space-y-2.5">
									{departmentData.map((d) => {
										const pct =
											stats.active > 0
												? Math.round(
														(d.value /
															stats.active) *
															100,
													)
												: 0;
										return (
											<div key={d.name}>
												<div className="mb-1 flex items-center justify-between text-xs">
													<span>{d.name}</span>
													<span className="text-muted-foreground tabular-nums">
														{d.value}
													</span>
												</div>
												<Progress
													value={pct}
													className="h-1.5"
												/>
											</div>
										);
									})}
								</div>
							</ContentCardSection>
						</ContentCard>
					)}

					{topCollectors.length > 0 && (
						<ContentCard>
							<ContentCardSection className="border-b border-border">
								<div className="flex items-center gap-2">
									<TrophyIcon className="size-3.5 text-muted-foreground" />
									<div className="text-sm font-medium">
										Top collectors
									</div>
								</div>
							</ContentCardSection>
							<ContentCardSection>
								<div className="space-y-2">
									{topCollectors.map((c, i) => (
										<div
											key={c.name}
											className="flex items-center gap-3 text-sm"
										>
											<span className="w-4 text-xs font-medium text-muted-foreground tabular-nums">
												{i + 1}
											</span>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium">
													{c.name}
												</p>
											</div>
											<span className="font-medium tabular-nums">
												{c.customers}
											</span>
											<span className="text-xs text-muted-foreground">
												customers
											</span>
										</div>
									))}
								</div>
							</ContentCardSection>
						</ContentCard>
					)}
				</div>
			)}
		</div>
	);
}
