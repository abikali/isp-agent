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
	PencilIcon,
	ReceiptIcon,
	WalletIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";
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

export function EmployeeReport({
	employeeId,
	organizationSlug,
}: {
	employeeId: string;
	organizationSlug: string;
}) {
	const [months, setMonths] = useState<Period>(6);
	const report = useEmployeeReport(employeeId, months);

	const { employee, financial, period, activity, stock, trend, recent } =
		report;

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

			{/* ── Inventory ─────────────────────────────────────────────── */}
			<DetailSection
				title="Inventory held"
				description={`${stock.itemCount} item${stock.itemCount !== 1 ? "s" : ""} · ${formatCurrency(stock.value)} total value`}
			>
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
