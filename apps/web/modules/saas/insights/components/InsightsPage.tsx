"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { PageShell } from "@shared/components/PageShell";
import { formatTime } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { useIsFetching } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import {
	ChevronDownIcon,
	RefreshCwIcon,
	SettingsIcon,
	SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import {
	type FinancePeriod,
	useFinanceBreakdown,
	useFinanceSummary,
	useFinanceTrend,
	useMoneyMap,
	useRefreshFinance,
} from "../hooks/use-finance";
import { buildVerdict, progressNote } from "../lib/verdict";
import { DetailPanel } from "./DetailPanel";
import { KeptTrendChart } from "./KeptTrendChart";
import { MoneyFlow } from "./MoneyFlow";
import { MoneyMapWizard } from "./MoneyMapWizard";
import { HeldCard, OwedCard } from "./PositionCards";
import { VerdictBanner } from "./VerdictBanner";

const PERIODS: Array<{ value: FinancePeriod; label: string }> = [
	{ value: "this-month", label: "This month" },
	{ value: "last-month", label: "Last month" },
	{ value: "last-3", label: "Last 3 months" },
	{ value: "last-12", label: "Last 12 months" },
];

/**
 * The owner's page.
 *
 * Everything above the "Show me the details" line is written for someone who
 * has never used an accounting screen: one sentence, one subtraction, two
 * position cards. Everything technical is behind the disclosure.
 *
 * What is deliberately NOT here: "handed off", "grand total", collector
 * balances, cycle locks, invoice counts. Those are operational questions and
 * they already have good pages under /billing.
 */
interface InsightsPageProps {
	period: FinancePeriod;
	onPeriodChange: (period: FinancePeriod) => void;
}

export function InsightsPage({ period, onPeriodChange }: InsightsPageProps) {
	const [showDetail, setShowDetail] = useState(false);
	const [wizardOpen, setWizardOpen] = useState(false);

	const summary = useFinanceSummary(period);
	const { breakdown, isLoading: breakdownLoading } = useFinanceBreakdown(
		period,
		showDetail,
	);
	const { points, isLoading: trendLoading } = useFinanceTrend(12);
	const { needsSetup, coverage } = useMoneyMap(true);

	const { activeOrganization } = useActiveOrganization();
	const organizationId = activeOrganization?.id;
	const slug = activeOrganization?.slug ?? "";
	const billingBase = `/app/${slug}/billing`;

	const refresh = useRefreshFinance();
	const refetching = useIsFetching({ queryKey: orpc.finance.key() }) > 0;
	const refreshing = refresh.isPending || refetching;

	const verdict = buildVerdict({
		periodLabel: summary.period.label,
		isPartial: summary.period.isPartial,
		progress: summary.period.progress,
		moneyIn: summary.moneyIn.total,
		moneyOut: summary.moneyOut.total,
		collected: summary.collected.total,
		net: summary.net,
		comparisonLabel: summary.comparison.label,
		comparisonNet: summary.comparison.net,
		comparisonMoneyIn: summary.comparison.moneyIn,
		unclassifiedShare: summary.moneyOut.unclassifiedShare,
		incomeStreamMissing: summary.gaps.wholesaleNeverSynced,
	});

	return (
		<PageShell
			title="How the business is doing"
			description="Everything you earned and spent, in one place."
			actions={
				<div className="flex items-center gap-2">
					<Select
						value={period}
						onValueChange={(v) =>
							onPeriodChange(v as FinancePeriod)
						}
					>
						<SelectTrigger className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PERIODS.map((p) => (
								<SelectItem key={p.value} value={p.value}>
									{p.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						variant="outline"
						size="icon"
						aria-label="Refresh the numbers"
						title={`Numbers as of ${formatTime(summary.computedAt, { hour: "2-digit", minute: "2-digit" })}. Click to recompute.`}
						disabled={!organizationId || refreshing}
						onClick={() => {
							if (organizationId) {
								refresh.mutate({ organizationId });
							}
						}}
					>
						<RefreshCwIcon
							className={cn(
								"size-4",
								refreshing && "animate-spin",
							)}
						/>
					</Button>
				</div>
			}
		>
			{needsSetup && (
				<SetupNudge
					coverage={coverage}
					onStart={() => setWizardOpen(true)}
				/>
			)}

			<VerdictBanner
				verdict={verdict}
				progressNote={progressNote(
					summary.period.isPartial,
					summary.period.from,
				)}
			/>

			{!summary.gaps.wholesaleNeverSynced && (
				<MoneyFlow
					periodLabel={summary.period.label}
					moneyIn={summary.moneyIn}
					moneyOut={summary.moneyOut.total}
					kept={summary.net}
					collected={summary.collected.total}
					streams={[
						{
							label: "Monthly subscriptions",
							amount: summary.collected.retail,
							color: "var(--chart-1)",
						},
						{
							label: "Setup fees & hardware",
							amount: summary.collected.field,
							color: "var(--chart-2)",
						},
						{
							label: "Dealers",
							amount: summary.collected.wholesale,
							color: "var(--chart-3)",
						},
					].filter((s) => s.amount > 0)}
				/>
			)}

			<div className="grid gap-4 md:grid-cols-2">
				<OwedCard
					total={summary.owed.total}
					count={summary.owed.count}
					byMonth={summary.owed.byMonth}
					collectPath={`${billingBase}/collect`}
				/>
				<HeldCard
					total={summary.held.total}
					holders={summary.held.holders}
					collectorsPath={`${billingBase}/collectors`}
				/>
			</div>

			<ContentCard>
				<ContentCardSection className="border-b border-border">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-sm font-medium">
								Month by month
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								What you kept after everything was paid. Bars
								below the line are months you spent more than
								you earned. The faded bar is the month still in
								progress.
							</p>
						</div>
					</div>
				</ContentCardSection>
				<ContentCardSection>
					{trendLoading ? (
						<Skeleton className="h-[220px] rounded-md" />
					) : (
						<KeptTrendChart
							data={points}
							partialLabel={
								points.find((p) => p.partial)?.label ?? null
							}
						/>
					)}
				</ContentCardSection>
			</ContentCard>

			{/* ── Advanced, on demand ────────────────────────────── */}
			<div>
				<button
					type="button"
					onClick={() => setShowDetail((v) => !v)}
					className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-foreground/20"
					aria-expanded={showDetail}
				>
					<span className="text-sm font-medium">
						{showDetail
							? "Hide the details"
							: "Show me the details"}
					</span>
					<ChevronDownIcon
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform",
							showDetail && "rotate-180",
						)}
					/>
				</button>

				{showDetail && (
					<div className="pt-4">
						<DetailPanel
							comparisonLabel={summary.comparison.label}
							revenue={breakdown?.revenue ?? []}
							costs={breakdown?.costs ?? []}
							draws={breakdown?.draws ?? []}
							isLoading={breakdownLoading}
						/>

						<div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
							<p className="text-pretty text-xs text-muted-foreground">
								Categories come from your money map. Change them
								any time.
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setWizardOpen(true)}
							>
								<SettingsIcon className="size-3.5" />
								Edit money map
							</Button>
						</div>
					</div>
				)}
			</div>

			<MoneyMapWizard open={wizardOpen} onOpenChange={setWizardOpen} />
		</PageShell>
	);
}

function SetupNudge({
	coverage,
	onStart,
}: {
	coverage: number;
	onStart: () => void;
}) {
	const pct = Math.round(coverage * 100);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.05] px-5 py-4">
			<div className="flex items-start gap-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
					<SparklesIcon className="size-4" />
				</div>
				<div>
					<p className="text-sm font-medium">
						{pct > 0
							? `${pct}% of your spending is sorted`
							: "Your spending isn't sorted yet"}
					</p>
					<p className="mt-0.5 text-pretty text-xs text-muted-foreground">
						Answer a few quick questions and we'll show you exactly
						where your money goes.
					</p>
				</div>
			</div>
			<Button size="sm" onClick={onStart}>
				Sort my spending
			</Button>
		</div>
	);
}

export function InsightsSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-28 rounded-xl" />
			<Skeleton className="h-36 rounded-xl" />
			<div className="grid gap-4 md:grid-cols-2">
				<Skeleton className="h-52 rounded-xl" />
				<Skeleton className="h-52 rounded-xl" />
			</div>
			<Skeleton className="h-72 rounded-lg" />
		</div>
	);
}
