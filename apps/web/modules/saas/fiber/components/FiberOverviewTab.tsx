"use client";

import {
	FIBER_AREA_LABELS,
	FIBER_AREA_STATUSES,
	FIBER_LOST_REASON_LABELS,
	FIBER_SOURCE_LABELS,
	FIBER_SOURCES,
	FIBER_STAGE_HINTS,
	FIBER_STAGE_LABELS,
	type FiberAreaStatus,
	type FiberLostReason,
	OPEN_FIBER_STAGES,
} from "@repo/api/modules/fiber/lib/constants";
import { ContentCard } from "@shared/components/ContentCard";
import { CHART_TOKENS } from "@shared/components/charts/chart-utils";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { cn } from "@ui/lib";
import {
	AlarmClockIcon,
	CableIcon,
	PhoneIcon,
	ShieldAlertIcon,
	TrophyIcon,
	UserMinusIcon,
} from "lucide-react";
import { useState } from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts children are read by type; @ui/components/chart already imports recharts statically
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
	type FiberOverview,
	useFiberOverview,
	useSetFiberAreaStatus,
} from "../hooks/use-fiber";
import type { PipelineFilters } from "./FiberPipeline";

const SOURCE_COLORS = [
	CHART_TOKENS.c1,
	CHART_TOKENS.c2,
	CHART_TOKENS.c3,
	CHART_TOKENS.c4,
	CHART_TOKENS.c5,
	CHART_TOKENS.c6,
];
const chartConfig = Object.fromEntries(
	FIBER_SOURCES.map((s, i) => [
		s,
		{
			label: FIBER_SOURCE_LABELS[s],
			color: SOURCE_COLORS[i % SOURCE_COLORS.length],
		},
	]),
) satisfies ChartConfig;

const AREA_TONE: Record<FiberAreaStatus, string> = {
	LIVE: "text-destructive",
	ROLLOUT: "text-warning",
	NONE: "text-muted-foreground",
};

const AREA_ROWS_COLLAPSED = 12;

interface FiberOverviewTabProps {
	organizationSlug: string;
	canManage: boolean;
	onOpenPipeline: (filters: PipelineFilters) => void;
	onOpenDefend: (area?: string) => void;
}

export function FiberOverviewTab({
	organizationSlug,
	canManage,
	onOpenPipeline,
	onOpenDefend,
}: FiberOverviewTabProps) {
	const data = useFiberOverview();
	const { kpis } = data;
	const landlinePct =
		kpis.activeCustomers > 0
			? Math.round((kpis.landlineAsked / kpis.activeCustomers) * 100)
			: 0;

	return (
		<div className="space-y-6">
			<Verdict
				data={data}
				onOpenPipeline={onOpenPipeline}
				onOpenDefend={onOpenDefend}
			/>

			<MetricStrip columns={6}>
				<MetricCard
					label="At risk"
					value={kpis.atRisk}
					icon={ShieldAlertIcon}
					tone={kpis.atRisk > 0 ? "danger" : "default"}
					hint={`${kpis.atRiskNotInPipeline} not in pipeline`}
					onClick={() => onOpenDefend()}
				/>
				<MetricCard
					label="Open leads"
					value={kpis.openLeads}
					icon={CableIcon}
					tone="info"
					hint={`+${kpis.newThisWeek} this week`}
					onClick={() => onOpenPipeline({ stage: "OPEN" })}
				/>
				<MetricCard
					label="Follow-ups due"
					value={kpis.overdue}
					icon={AlarmClockIcon}
					tone={kpis.overdue > 0 ? "warning" : "default"}
					hint={`${kpis.unassigned} unassigned`}
					onClick={() =>
						onOpenPipeline({ stage: "OPEN", overdue: true })
					}
				/>
				<MetricCard
					label="Won from the pipeline"
					value={kpis.won}
					icon={TrophyIcon}
					tone="success"
					hint={`${kpis.onFiber} customers on a fiber plan`}
					onClick={() => onOpenPipeline({ stage: "WON" })}
				/>
				<MetricCard
					label="Lost to Ogero"
					value={kpis.lostToOgero}
					icon={UserMinusIcon}
					tone={kpis.lostToOgero > 0 ? "danger" : "default"}
					hint={`${kpis.lostToOgero30} last 30 days`}
					onClick={() => onOpenPipeline({ stage: "LOST" })}
				/>
				<MetricCard
					label="Landline known"
					value={`${landlinePct}%`}
					icon={PhoneIcon}
					tone="default"
					hint={`${kpis.landlineYes} have one · ${kpis.activeCustomers - kpis.landlineAsked} not asked`}
				/>
			</MetricStrip>

			<div className="grid gap-6 lg:grid-cols-5">
				<ContentCard className="p-4 lg:col-span-2">
					<h3 className="text-sm font-semibold">Pipeline</h3>
					<p className="mb-3 text-xs text-muted-foreground">
						Where every open lead stands. Click a stage to work it.
					</p>
					<Funnel data={data} onOpenPipeline={onOpenPipeline} />
				</ContentCard>
				<ContentCard className="p-4 lg:col-span-3">
					<h3 className="text-sm font-semibold">
						New leads per week
					</h3>
					<p className="mb-3 text-xs text-muted-foreground">
						Where fiber interest comes from.
					</p>
					<ChartContainer
						config={chartConfig}
						className="h-56 w-full"
					>
						<BarChart
							data={data.weekly}
							margin={{ left: 0, right: 4, top: 4 }}
						>
							<CartesianGrid
								vertical={false}
								stroke={CHART_TOKENS.grid}
								strokeDasharray="3 3"
							/>
							<XAxis
								dataKey="weekStart"
								tickFormatter={(v: string) =>
									formatDate(v, {
										day: "numeric",
										month: "short",
									})
								}
								tickLine={false}
								axisLine={false}
								fontSize={11}
								stroke={CHART_TOKENS.axis}
							/>
							<YAxis
								allowDecimals={false}
								width={28}
								tickLine={false}
								axisLine={false}
								fontSize={11}
								stroke={CHART_TOKENS.axis}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ChartLegend content={<ChartLegendContent />} />
							{FIBER_SOURCES.map((s) => (
								<Bar
									key={s}
									dataKey={s}
									stackId="a"
									fill={`var(--color-${s})`}
								/>
							))}
						</BarChart>
					</ChartContainer>
				</ContentCard>
			</div>

			<AreaTable
				areas={data.areas}
				organizationSlug={organizationSlug}
				canManage={canManage}
				onOpenDefend={onOpenDefend}
			/>

			{Object.keys(data.lostReasons).length > 0 && (
				<ContentCard className="p-4">
					<h3 className="text-sm font-semibold">Why we lose</h3>
					<div className="mt-3 flex flex-wrap gap-2">
						{Object.entries(data.lostReasons)
							.sort((a, b) => b[1] - a[1])
							.map(([reason, count]) => (
								<span
									key={reason}
									className="rounded-md border px-2.5 py-1 text-sm"
								>
									{FIBER_LOST_REASON_LABELS[
										reason as FiberLostReason
									] ?? reason}{" "}
									<span className="font-semibold tabular-nums">
										{count}
									</span>
								</span>
							))}
					</div>
				</ContentCard>
			)}
		</div>
	);
}

/** One plain sentence on what to do next — the first thing Jhonny reads. */
function Verdict({
	data,
	onOpenPipeline,
	onOpenDefend,
}: {
	data: FiberOverview;
	onOpenPipeline: (filters: PipelineFilters) => void;
	onOpenDefend: (area?: string) => void;
}) {
	const { kpis } = data;
	const fightAreas = data.areas.filter((a) => a.status !== "NONE").length;
	let message: string;
	let action: { label: string; run: () => void } | null = null;
	if (kpis.overdue > 0) {
		message = `${kpis.overdue} follow-up${kpis.overdue === 1 ? " is" : "s are"} overdue — these customers are waiting for us.`;
		action = {
			label: "Open overdue",
			run: () => onOpenPipeline({ stage: "OPEN", overdue: true }),
		};
	} else if (data.byStage.NEW > 0) {
		message = `${data.byStage.NEW} new lead${data.byStage.NEW === 1 ? "" : "s"} nobody has contacted yet.`;
		action = {
			label: "Call them",
			run: () => onOpenPipeline({ stage: "NEW" }),
		};
	} else if (kpis.atRiskNotInPipeline > 0) {
		message = `${kpis.atRiskNotInPipeline} at-risk customer${kpis.atRiskNotInPipeline === 1 ? " is" : "s are"} not in the pipeline yet — reach them before Ogero does.`;
		action = { label: "Open defend list", run: () => onOpenDefend() };
	} else if (fightAreas === 0) {
		message =
			"Mark the areas where Ogero boxes are going in — the defend list works from them.";
	} else {
		message = "Everything is covered. Keep the follow-ups moving.";
	}
	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
				action ? "border-warning/40 bg-warning/5" : "bg-muted/30",
			)}
		>
			<p className="text-sm font-medium">{message}</p>
			{action && (
				<Button size="sm" onClick={action.run} className="shrink-0">
					{action.label}
				</Button>
			)}
		</div>
	);
}

function Funnel({
	data,
	onOpenPipeline,
}: {
	data: FiberOverview;
	onOpenPipeline: (filters: PipelineFilters) => void;
}) {
	const stages = [...OPEN_FIBER_STAGES, "WON" as const];
	const max = Math.max(1, ...stages.map((s) => data.byStage[s] ?? 0));
	return (
		<div className="space-y-1.5">
			{stages.map((stage) => {
				const count = data.byStage[stage] ?? 0;
				return (
					<button
						key={stage}
						type="button"
						title={FIBER_STAGE_HINTS[stage]}
						onClick={() => onOpenPipeline({ stage })}
						className="group flex w-full items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-muted/60"
					>
						<span className="w-24 shrink-0 text-xs text-muted-foreground group-hover:text-foreground">
							{FIBER_STAGE_LABELS[stage]}
						</span>
						<span className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
							<span
								className={cn(
									"absolute inset-y-0 left-0 rounded",
									stage === "WON"
										? "bg-success/70"
										: "bg-info/60",
								)}
								style={{ width: `${(count / max) * 100}%` }}
							/>
						</span>
						<span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
							{count}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function AreaTable({
	areas,
	organizationSlug,
	canManage,
	onOpenDefend,
}: {
	areas: FiberOverview["areas"];
	organizationSlug: string;
	canManage: boolean;
	onOpenDefend: (area?: string) => void;
}) {
	const organizationId = useOrganizationId();
	const setStatus = useSetFiberAreaStatus();
	const [showAll, setShowAll] = useState(false);
	const visible = showAll ? areas : areas.slice(0, AREA_ROWS_COLLAPSED);
	const fightGroups = areas
		.filter((a) => a.status !== "NONE")
		.flatMap((a) => a.groupNames);

	return (
		<ContentCard>
			<div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h3 className="text-sm font-semibold">Areas</h3>
					<p className="text-xs text-muted-foreground">
						Set where Ogero boxes are going in. Customers there
						count as at risk.
					</p>
				</div>
				{fightGroups.length > 0 && (
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/app/$organizationSlug/marketing/new"
							params={{ organizationSlug }}
							search={{
								name: "Fiber offer",
								groups: fightGroups,
							}}
						>
							Broadcast to fiber areas
						</Link>
					</Button>
				)}
			</div>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Area</TableHead>
							<TableHead className="w-44">Fiber status</TableHead>
							<TableHead className="text-right">
								Customers
							</TableHead>
							<TableHead className="text-right">
								Landline
							</TableHead>
							<TableHead className="text-right">
								At risk
							</TableHead>
							<TableHead className="text-right">
								Open leads
							</TableHead>
							<TableHead className="text-right">Won</TableHead>
							<TableHead className="text-right">
								Lost to Ogero
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visible.map((a) => (
							<TableRow key={a.area}>
								<TableCell className="font-medium capitalize">
									{a.area}
								</TableCell>
								<TableCell>
									{canManage ? (
										<Select
											value={a.status}
											onValueChange={(status) =>
												organizationId &&
												setStatus.mutate(
													{
														organizationId,
														area: a.area,
														status: status as FiberAreaStatus,
													},
													{
														onError: (e) =>
															toast.error(
																e.message,
															),
													},
												)
											}
										>
											<SelectTrigger
												className={cn(
													"h-8",
													AREA_TONE[a.status],
												)}
											>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{FIBER_AREA_STATUSES.map(
													(s) => (
														<SelectItem
															key={s}
															value={s}
														>
															{
																FIBER_AREA_LABELS[
																	s
																]
															}
														</SelectItem>
													),
												)}
											</SelectContent>
										</Select>
									) : (
										<span className={AREA_TONE[a.status]}>
											{FIBER_AREA_LABELS[a.status]}
										</span>
									)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{a.customers}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{a.landline}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{a.atRisk > 0 ? (
										<button
											type="button"
											className="font-semibold text-destructive underline-offset-2 hover:underline"
											onClick={() => onOpenDefend(a.area)}
										>
											{a.atRisk}
										</button>
									) : (
										0
									)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{a.openLeads}
								</TableCell>
								<TableCell className="text-right tabular-nums text-success">
									{a.won}
								</TableCell>
								<TableCell className="text-right tabular-nums text-destructive">
									{a.lostToOgero}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{areas.length > AREA_ROWS_COLLAPSED && (
				<div className="border-t p-2 text-center">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowAll((v) => !v)}
					>
						{showAll
							? "Show fewer"
							: `Show all ${areas.length} areas`}
					</Button>
				</div>
			)}
		</ContentCard>
	);
}
