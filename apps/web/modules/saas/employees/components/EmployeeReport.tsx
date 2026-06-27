"use client";

import { ChartCard } from "@shared/components/ChartCard";
import {
	CHART_TOKENS,
	formatCompactCurrency,
} from "@shared/components/charts/chart-utils";
import { DetailSection } from "@shared/components/DetailPanel";
import { EmptyState } from "@shared/components/EmptyState";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { MetricDisplay } from "@shared/components/MetricDisplay";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { cn } from "@ui/lib";
import {
	ArrowRightLeftIcon,
	BanknoteIcon,
	BoxesIcon,
	CheckCircle2Icon,
	ClipboardListIcon,
	HandCoinsIcon,
	PackagePlusIcon,
	PencilIcon,
	ReceiptIcon,
	RotateCcwIcon,
	ScaleIcon,
	Undo2Icon,
	WalletIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts is the shared chart lib statically imported across the codebase (single shared chunk); lazy-loading one consumer yields no bundle win
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useEmployeeReport } from "../hooks/use-employees";
import {
	EMPLOYEE_DEPARTMENT_LABELS,
	EMPLOYEE_STATUS_LABELS,
} from "../lib/constants";

const LAYOUT_LABELS: Record<string, string> = {
	standard: "Standard",
	collector: "Collector",
	worker: "Field worker",
};

const PERIOD_OPTIONS = [3, 6, 12] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

const EXPENSE_STATUS_LABELS: Record<string, string> = {
	PENDING: "Pending",
	APPROVED: "Approved",
	REJECTED: "Rejected",
};

const trendConfig = {
	collected: { label: "Collected", color: CHART_TOKENS.c1 },
	handedOff: { label: "Handed off", color: CHART_TOKENS.c2 },
	expenses: { label: "Expenses", color: CHART_TOKENS.c4 },
} satisfies ChartConfig;

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive employee-report feature; its stat/chart/activity sections share one report dataset and splitting would thread props excessively
export function EmployeeReport({
	employeeId,
	organizationSlug,
}: {
	employeeId: string;
	organizationSlug: string;
}) {
	const [months, setMonths] = useState<Period>(6);
	const report = useEmployeeReport(employeeId, months);

	const {
		employee,
		financial,
		period,
		activity,
		stock,
		settlement,
		stockFlow,
		trend,
		recent,
	} = report;

	const statusType =
		employee.status === "ACTIVE"
			? "active"
			: employee.status === "ON_LEAVE"
				? "pending"
				: "inactive";

	const hasTrendData = trend.some(
		(t) => t.collected || t.handedOff || t.expenses,
	);

	return (
		<PageShell
			title={employee.name}
			backTo={`/app/${organizationSlug}/employees`}
			backLabel="Employees"
			subtitle={
				<span className="flex flex-wrap items-center gap-2 sm:gap-3">
					<span className="font-mono">{employee.employeeNumber}</span>
					<StatusIndicator
						status={statusType}
						variant="badge"
						label={
							EMPLOYEE_STATUS_LABELS[employee.status] ??
							employee.status
						}
					/>
					<Badge variant="outline">
						{LAYOUT_LABELS[employee.preferredLayout] ??
							employee.preferredLayout}
					</Badge>
					{employee.department && (
						<Badge variant="outline">
							{EMPLOYEE_DEPARTMENT_LABELS[employee.department] ??
								employee.department}
						</Badge>
					)}
					{employee.dealer && (
						<Badge variant="outline">{employee.dealer.name}</Badge>
					)}
				</span>
			}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex rounded-md border border-border bg-card p-0.5">
						{PERIOD_OPTIONS.map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => setMonths(p)}
								className={cn(
									"rounded px-2.5 py-1 text-xs font-medium transition-colors",
									months === p
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{p}M
							</button>
						))}
					</div>
					<Button asChild variant="outline" size="sm">
						<Link
							to="/app/$organizationSlug/employees/$employeeId"
							params={{ organizationSlug, employeeId }}
							preload="intent"
						>
							<PencilIcon className="mr-1.5 size-3.5" />
							Edit details
						</Link>
					</Button>
				</div>
			}
		>
			{/* ── Headline KPIs ─────────────────────────────────────────── */}
			<MetricStrip columns={6}>
				<MetricCard
					label="Cash in hand"
					value={formatCurrency(financial.balance)}
					icon={WalletIcon}
					tone={financial.balance > 0 ? "warning" : "success"}
					hint="Owed to office"
				/>
				<MetricCard
					label="Collected"
					value={formatCurrency(financial.totalCollected)}
					icon={BanknoteIcon}
					tone="success"
					hint="All time"
				/>
				<MetricCard
					label="Handed off"
					value={formatCurrency(financial.totalHandedOff)}
					icon={ArrowRightLeftIcon}
					hint="All time"
				/>
				<MetricCard
					label="Open tasks"
					value={activity.openTasks}
					icon={ClipboardListIcon}
					tone={activity.openTasks > 0 ? "warning" : "default"}
				/>
				<MetricCard
					label="Done (mo)"
					value={activity.completedThisMonth}
					icon={CheckCircle2Icon}
					tone={
						activity.completedThisMonth > 0 ? "success" : "default"
					}
					hint="This month"
				/>
				<MetricCard
					label="Stock value"
					value={formatCurrency(stock.value)}
					icon={BoxesIcon}
					tone="purple"
					hint={`${stock.units} unit${stock.units !== 1 ? "s" : ""}`}
				/>
			</MetricStrip>

			{/* ── Settlement (who owes whom) ────────────────────────────── */}
			<SettlementPanel
				firstName={employee.name}
				settlement={settlement}
			/>

			{/* ── Trend chart ───────────────────────────────────────────── */}
			<ChartCard
				title={`Cash & activity — last ${months} months`}
				description="Collected vs handed off vs expenses, per month"
			>
				{hasTrendData ? (
					<ChartContainer
						config={trendConfig}
						className="h-64 w-full"
					>
						<BarChart
							data={trend}
							margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
						>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={CHART_TOKENS.grid}
								vertical={false}
							/>
							<XAxis
								dataKey="label"
								stroke={CHART_TOKENS.axis}
								tickLine={false}
								axisLine={false}
								fontSize={11}
							/>
							<YAxis
								tickFormatter={(v) => formatCompactCurrency(v)}
								stroke={CHART_TOKENS.axis}
								tickLine={false}
								axisLine={false}
								fontSize={11}
								width={48}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value, name) => [
											` ${formatCurrency(Number(value))}`,
											trendConfig[
												name as keyof typeof trendConfig
											]?.label ?? String(name),
										]}
									/>
								}
							/>
							<Bar
								dataKey="collected"
								fill={CHART_TOKENS.c1}
								radius={[3, 3, 0, 0]}
								isAnimationActive
								animationDuration={320}
							/>
							<Bar
								dataKey="handedOff"
								fill={CHART_TOKENS.c2}
								radius={[3, 3, 0, 0]}
								isAnimationActive
								animationDuration={320}
							/>
							<Bar
								dataKey="expenses"
								fill={CHART_TOKENS.c4}
								radius={[3, 3, 0, 0]}
								isAnimationActive
								animationDuration={320}
							/>
						</BarChart>
					</ChartContainer>
				) : (
					<EmptyState
						icon={BanknoteIcon}
						title="No activity in this period"
						description="No payments, handoffs, or expenses were recorded in the selected window."
					/>
				)}
			</ChartCard>

			{/* ── Financial + Field activity ────────────────────────────── */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<DetailSection
					title="Financial"
					description={`Cash movement over the last ${months} months`}
				>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<MetricDisplay
							label="Collected"
							value={period.collected}
							format="currency"
							secondary={`${period.payments} payments`}
						/>
						<MetricDisplay
							label="Handed off"
							value={period.handedOff}
							format="currency"
						/>
						<MetricDisplay
							label="Expenses"
							value={period.expenses}
							format="currency"
						/>
						<MetricDisplay
							label="Installs"
							value={period.installations}
							format="number"
							secondary="Logged"
						/>
					</div>

					<div className="mt-4 space-y-2 border-t border-border pt-4">
						<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							Expense claims (all time)
						</p>
						<ExpenseRow
							label={EXPENSE_STATUS_LABELS.PENDING ?? "Pending"}
							tone="warning"
							count={financial.expensePending.count}
							amount={financial.expensePending.amount}
						/>
						<ExpenseRow
							label={EXPENSE_STATUS_LABELS.APPROVED ?? "Approved"}
							tone="success"
							count={financial.expenseApproved.count}
							amount={financial.expenseApproved.amount}
						/>
						<ExpenseRow
							label={EXPENSE_STATUS_LABELS.REJECTED ?? "Rejected"}
							tone="muted"
							count={financial.expenseRejected.count}
							amount={financial.expenseRejected.amount}
						/>
					</div>
				</DetailSection>

				<DetailSection
					title="Field activity"
					description="Assignments and lifetime output"
				>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						<MetricDisplay
							label="Collecting"
							value={activity.customersCollecting}
							format="number"
							secondary="Customers"
						/>
						<MetricDisplay
							label="Field work"
							value={activity.customersWorker}
							format="number"
							secondary="Customers"
						/>
						<MetricDisplay
							label="Stations"
							value={activity.stations}
							format="number"
						/>
						<MetricDisplay
							label="Installations"
							value={activity.installationsCount}
							format="number"
							secondary="All time"
						/>
						<MetricDisplay
							label="Install value"
							value={activity.installationsValue}
							format="currency"
						/>
						<MetricDisplay
							label="Completed"
							value={activity.completedThisMonth}
							format="number"
							secondary="This month"
						/>
					</div>
				</DetailSection>
			</div>

			{/* ── Inventory / stock accountability ──────────────────────── */}
			<DetailSection
				title="Stock accountability"
				description="Inventory in this worker's custody and how it moved"
			>
				{/* Held value — what the worker is accountable for right now */}
				<div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							Value held (owed for stock)
						</p>
						<p className="mt-0.5 text-2xl font-semibold tabular-nums">
							{formatCurrency(stock.value)}
						</p>
						<p className="text-xs text-muted-foreground">
							{stock.units} unit{stock.units !== 1 ? "s" : ""}{" "}
							across {stock.itemCount} item
							{stock.itemCount !== 1 ? "s" : ""} — to be
							installed, returned, or settled
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<StockFlowChip
							icon={PackagePlusIcon}
							label="Delivered"
							value={stockFlow.deliveredUnits}
							hint={`last ${months}m`}
						/>
						<StockFlowChip
							icon={Undo2Icon}
							label="Returned"
							value={stockFlow.returnedUnits}
							hint={`last ${months}m`}
						/>
						<StockFlowChip
							icon={WrenchIcon}
							label="Installed"
							value={stockFlow.installedUnits}
							hint={`last ${months}m`}
						/>
						<StockFlowChip
							icon={RotateCcwIcon}
							label="Recovery"
							value={stockFlow.recoveryPendingUnits}
							hint={`${stockFlow.recoveryPendingCount} pending`}
							tone={
								stockFlow.recoveryPendingCount > 0
									? "warning"
									: "default"
							}
						/>
					</div>
				</div>

				{stock.allocations.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No stock currently allocated to this worker.
					</p>
				) : (
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{stock.allocations.map((s) => (
							<div
								key={s.id}
								className="flex items-center justify-between rounded-lg border border-border p-3"
							>
								<div className="min-w-0">
									<p className="truncate text-sm font-medium">
										{s.name}
									</p>
									<p className="text-xs text-muted-foreground tabular-nums">
										{s.quantity} ×{" "}
										{formatCurrency(s.unitPrice)}
									</p>
								</div>
								<span className="shrink-0 text-sm font-medium tabular-nums">
									{formatCurrency(s.total)}
								</span>
							</div>
						))}
					</div>
				)}
			</DetailSection>

			{/* ── Recent activity ───────────────────────────────────────── */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<RecentList
					title="Recent payments"
					icon={BanknoteIcon}
					emptyLabel="No payments collected in this period."
					rows={recent.payments.map((p) => ({
						id: p.id,
						primary: displayName(
							p.customer.firstName,
							p.customer.lastName,
						),
						secondary: formatDate(p.paidAt),
						amount: p.paidAmount,
						href: p.customer.id,
					}))}
					organizationSlug={organizationSlug}
				/>
				<RecentList
					title="Recent expenses"
					icon={ReceiptIcon}
					emptyLabel="No expenses submitted in this period."
					rows={recent.expenses.map((e) => ({
						id: e.id,
						primary: e.description,
						secondary: `${formatDate(e.createdAt)} · ${EXPENSE_STATUS_LABELS[e.status] ?? e.status}`,
						amount: e.amount,
					}))}
					organizationSlug={organizationSlug}
				/>
				<RecentList
					title="Recent installations"
					icon={WrenchIcon}
					emptyLabel="No installations logged in this period."
					rows={recent.installations.map((inst) => ({
						id: inst.id,
						primary: inst.customer
							? displayName(
									inst.customer.firstName,
									inst.customer.lastName,
								)
							: (inst.stockItem?.name ?? "Installation"),
						secondary: `${formatDate(inst.installedAt)}${inst.stockItem ? ` · ${inst.stockItem.name}` : ""}`,
						amount: inst.price,
						href: inst.customer?.id,
					}))}
					organizationSlug={organizationSlug}
				/>
				<RecentList
					title="Recent handoffs"
					icon={ArrowRightLeftIcon}
					emptyLabel="No cash handoffs in this period."
					rows={recent.cashCollections.map((c) => ({
						id: c.id,
						primary: c.notes ?? c.type.toLowerCase(),
						secondary: formatDate(c.collectedAt),
						amount: c.amount,
					}))}
					organizationSlug={organizationSlug}
				/>
			</div>
		</PageShell>
	);
}

// ─── Helpers ───────────────────────────────────────────────────────────

function SettlementPanel({
	firstName,
	settlement,
}: {
	firstName: string;
	settlement: {
		cashInHand: number;
		stockValue: number;
		pendingReimbursements: number;
		netOwedByWorker: number;
	};
}) {
	const net = settlement.netOwedByWorker;
	const settled = Math.abs(net) < 0.005;
	const workerOwes = net > 0;
	const shortName = firstName.split(" ")[0] ?? firstName;

	const headline = settled
		? "All settled"
		: workerOwes
			? `${shortName} owes the office`
			: `Office owes ${shortName}`;

	const tone = settled ? "success" : workerOwes ? "warning" : "info";
	const toneText =
		tone === "success"
			? "text-success"
			: tone === "warning"
				? "text-warning"
				: "text-info";
	const toneRing =
		tone === "success"
			? "ring-success/20"
			: tone === "warning"
				? "ring-warning/25"
				: "ring-info/25";

	return (
		<DetailSection
			title="Settlement"
			description="Net cash + stock position between this worker and the office"
		>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
				{/* Net — the headline answer */}
				<div
					className={cn(
						"flex flex-col justify-center rounded-lg border border-border bg-card p-5 shadow-xs ring-1 ring-inset lg:col-span-5",
						toneRing,
					)}
				>
					<div className="flex items-center gap-2 text-muted-foreground">
						<ScaleIcon className="size-4" />
						<span className="text-xs font-medium uppercase tracking-wider">
							Net balance
						</span>
					</div>
					<p
						className={cn(
							"mt-1 text-3xl font-semibold tabular-nums",
							toneText,
						)}
					>
						{formatCurrency(Math.abs(net))}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{headline}
					</p>
				</div>

				{/* Breakdown — cash + stock − reimbursements = net */}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-7">
					<SettlementTile
						icon={WalletIcon}
						label="Cash in hand"
						value={settlement.cashInHand}
						caption="Collected, not handed off"
						sign="owes"
					/>
					<SettlementTile
						icon={BoxesIcon}
						label="Stock held"
						value={settlement.stockValue}
						caption="Value in his custody"
						sign="owes"
					/>
					<SettlementTile
						icon={HandCoinsIcon}
						label="Reimbursements"
						value={settlement.pendingReimbursements}
						caption="Pending expenses owed to him"
						sign="owed"
					/>
				</div>
			</div>
			<p className="text-xs text-muted-foreground/70">
				Net = cash in hand + stock held − pending reimbursements.
				Approved expenses are already deducted from cash in hand.
			</p>
		</DetailSection>
	);
}

function SettlementTile({
	icon: Icon,
	label,
	value,
	caption,
	sign,
}: {
	icon: typeof WalletIcon;
	label: string;
	value: number;
	caption: string;
	sign: "owes" | "owed";
}) {
	return (
		<div className="flex flex-col justify-between rounded-lg border border-border p-3.5">
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</span>
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
			</div>
			<p className="mt-2 text-xl font-semibold tabular-nums">
				{formatCurrency(value)}
			</p>
			<p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
				<span
					className={cn(
						"inline-block rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide",
						sign === "owed"
							? "bg-info/10 text-info"
							: "bg-warning/10 text-warning",
					)}
				>
					{sign === "owed" ? "+ office" : "− worker"}
				</span>
				{caption}
			</p>
		</div>
	);
}

function StockFlowChip({
	icon: Icon,
	label,
	value,
	hint,
	tone = "default",
}: {
	icon: typeof PackagePlusIcon;
	label: string;
	value: number;
	hint: string;
	tone?: "default" | "warning";
}) {
	return (
		<div className="rounded-md border border-border bg-card px-2.5 py-2">
			<div className="flex items-center gap-1.5">
				<Icon
					className={cn(
						"size-3.5",
						tone === "warning"
							? "text-warning"
							: "text-muted-foreground",
					)}
				/>
				<span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					{label}
				</span>
			</div>
			<p className="mt-1 text-lg font-semibold leading-none tabular-nums">
				{value}
			</p>
			<p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>
		</div>
	);
}

function ExpenseRow({
	label,
	tone,
	count,
	amount,
}: {
	label: string;
	tone: "warning" | "success" | "muted";
	count: number;
	amount: number;
}) {
	const dot =
		tone === "warning"
			? "bg-warning"
			: tone === "success"
				? "bg-success"
				: "bg-muted-foreground";
	return (
		<div className="flex items-center justify-between text-sm">
			<span className="flex items-center gap-2 text-muted-foreground">
				<span className={cn("size-1.5 rounded-full", dot)} />
				{label}
				<span className="tabular-nums text-muted-foreground/70">
					({count})
				</span>
			</span>
			<span className="font-medium tabular-nums">
				{formatCurrency(amount)}
			</span>
		</div>
	);
}

interface RecentRow {
	id: string;
	primary: string;
	secondary: string;
	amount: number;
	href?: string | undefined;
}

function RecentList({
	title,
	icon: Icon,
	rows,
	emptyLabel,
	organizationSlug,
}: {
	title: string;
	icon: typeof BanknoteIcon;
	rows: RecentRow[];
	emptyLabel: string;
	organizationSlug: string;
}) {
	return (
		<DetailSection title={title}>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{emptyLabel}</p>
			) : (
				<div className="space-y-2">
					{rows.map((row) => (
						<div
							key={row.id}
							className="flex items-center justify-between gap-3 text-sm"
						>
							<div className="flex min-w-0 items-center gap-2">
								<Icon className="size-3.5 shrink-0 text-muted-foreground" />
								<div className="min-w-0">
									{row.href ? (
										<Link
											to="/app/$organizationSlug/customers/$customerId"
											params={{
												organizationSlug,
												customerId: row.href,
											}}
											className="block truncate font-medium hover:underline"
											preload="intent"
										>
											{row.primary}
										</Link>
									) : (
										<p className="truncate font-medium">
											{row.primary}
										</p>
									)}
									<p className="truncate text-xs text-muted-foreground">
										{row.secondary}
									</p>
								</div>
							</div>
							<span className="shrink-0 font-medium tabular-nums">
								{formatCurrency(row.amount)}
							</span>
						</div>
					))}
				</div>
			)}
		</DetailSection>
	);
}
