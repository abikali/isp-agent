"use client";

import { MoneyMapWizard } from "@saas/insights/client";
import { useActiveOrganization } from "@saas/organizations/client";
import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PageShell } from "@shared/components/PageShell";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import { cn } from "@ui/lib";
import {
	ImageIcon,
	LayersIcon,
	PlusIcon,
	RepeatIcon,
	WandSparklesIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useFinanceCategories,
	useSetExpenseBucket,
	useSpendingBucket,
	useSpendingOverview,
} from "../../hooks/use-spending";
import { AddExpenseSheet } from "./AddExpenseSheet";
import { RecurringExpenseSheet } from "./RecurringExpenseSheet";

interface BucketDetailPageProps {
	bucketId: string;
}

const MATCH_WORDS: Record<string, string> = {
	contains: "contains",
	exact: "is exactly",
	startsWith: "starts with",
};

/**
 * One bucket: this month against last, six months of bars, what feeds it
 * (rules and recurring lines), what the money actually was, and the latest
 * rows. For "none" it is the sorting desk — every row gets a picker.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- one page, sections share the bucket read and the two sheets
export function BucketDetailPage({ bucketId }: BucketDetailPageProps) {
	const data = useSpendingBucket(bucketId);
	const overview = useSpendingOverview();
	const { activeOrganization } = useActiveOrganization();
	const slug = activeOrganization?.slug ?? "";
	const organizationId = useOrganizationId();
	const { categories } = useFinanceCategories();
	const setBucket = useSetExpenseBucket();

	const [adding, setAdding] = useState(false);
	const [recurringOpen, setRecurringOpen] = useState(false);
	const [wizardOpen, setWizardOpen] = useState(false);
	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

	const isNone = bucketId === "none";
	const { bucket, months } = data;
	const max = Math.max(...months.map((m) => m.amount), 1);
	const delta = data.thisMonth - data.lastMonth;
	const canManage = overview.canManage;

	async function move(expenseId: string, financeCategoryId: string | null) {
		if (!organizationId) {
			return;
		}
		try {
			await setBucket.mutateAsync({
				organizationId,
				id: expenseId,
				financeCategoryId,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not move it",
			);
		}
	}

	return (
		<PageShell
			title={bucket.label}
			subtitle={bucket.hint ?? undefined}
			backTo={`/app/${slug}/expenses`}
			backLabel="Spending"
			badges={
				bucket.kind === "DRAW" ? (
					<Badge variant="outline">Not a business cost</Badge>
				) : isNone ? (
					<Badge variant="secondary">Unsorted</Badge>
				) : null
			}
			actions={
				canManage ? (
					<div className="flex flex-wrap items-center gap-2">
						{isNone ? (
							<Button
								size="sm"
								onClick={() => setWizardOpen(true)}
							>
								<WandSparklesIcon className="size-4" />
								Sort the recurring lines
							</Button>
						) : (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setRecurringOpen(true)}
								>
									<RepeatIcon className="size-4" />
									Repeat monthly
								</Button>
								<Button
									size="sm"
									onClick={() => setAdding(true)}
								>
									<PlusIcon className="size-4" />
									Add expense
								</Button>
							</>
						)}
					</div>
				) : undefined
			}
		>
			<div className="grid gap-4 md:grid-cols-2">
				<section className="rounded-xl border bg-card p-5 shadow-xs">
					<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						{data.periodLabel}
					</div>
					<div className="mt-2 text-4xl font-medium tabular-nums leading-none tracking-tight">
						{formatCurrency(data.thisMonth)}
					</div>
					<p className="mt-2 text-sm text-muted-foreground">
						{data.lastMonth > 0
							? `${delta >= 0 ? "Up" : "Down"} ${formatCurrency(Math.abs(delta))} on last month's ${formatCurrency(data.lastMonth)}.`
							: "Nothing here last month."}
					</p>
				</section>
				<section className="rounded-xl border bg-card p-5 shadow-xs">
					<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
						All time
					</div>
					<div className="mt-2 text-4xl font-medium tabular-nums leading-none tracking-tight">
						{formatCurrency(data.allTime.amount)}
					</div>
					<p className="mt-2 text-sm text-muted-foreground">
						{data.allTime.count} approved{" "}
						{data.allTime.count === 1 ? "line" : "lines"}
						{data.recurring.filter((r) => r.active).length > 0 &&
							` · ${formatCurrency(
								data.recurring
									.filter((r) => r.active)
									.reduce((s, r) => s + r.amount, 0),
							)} of it repeats every month`}
						.
					</p>
				</section>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				<div className="space-y-4 lg:col-span-2">
					<ContentCard>
						<ContentCardSection>
							<div className="text-sm font-medium">By month</div>
							<div className="mt-4 flex h-32 items-end gap-2">
								{months.map((m) => (
									<div
										key={`${m.year}-${m.month}`}
										className="flex flex-1 flex-col items-center gap-1"
										title={`${m.label}: ${formatCurrency(m.amount)} across ${m.count} lines`}
									>
										<span className="text-[10px] tabular-nums text-muted-foreground">
											{m.amount > 0
												? formatCurrency(m.amount)
												: ""}
										</span>
										<div className="flex h-24 w-full items-end">
											<div
												className={cn(
													"w-full rounded-t-sm",
													m.amount === 0
														? "bg-muted"
														: isNone
															? "bg-warning/70"
															: "bg-chart-3/80",
												)}
												style={{
													height: `${Math.max((m.amount / max) * 100, m.amount > 0 ? 6 : 2)}%`,
												}}
											/>
										</div>
										<span className="text-[10px] text-muted-foreground">
											{m.label}
										</span>
									</div>
								))}
							</div>
						</ContentCardSection>
					</ContentCard>

					<ContentCard>
						<ContentCardSection
							padded={false}
							className="border-b border-border px-4 py-3"
						>
							<div className="text-sm font-medium">
								{isNone ? "Sort these" : "Latest lines"}
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{isNone
									? "Pick a bucket on each line. Rules from the wizard file the rest."
									: "The most recent approved money in this bucket."}
							</p>
						</ContentCardSection>
						{data.recent.length === 0 ? (
							<EmptyState
								icon={LayersIcon}
								title="Nothing here"
								description={
									isNone
										? "Every approved line has a bucket."
										: "No approved spending in this bucket yet."
								}
							/>
						) : (
							<ul>
								{data.recent.map((row) => (
									<li
										key={row.id}
										className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
									>
										<div className="min-w-0 flex-1">
											<div className="truncate">
												{row.description}
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{formatDate(row.createdAt, {
													dateStyle: "medium",
												})}
												{" · "}
												{row.submittedBy?.name ??
													(row.recurringExpenseId
														? "every month"
														: (row.createdBy
																?.name ??
															"direct"))}
												{row.category &&
													` · ${row.category}`}
											</div>
										</div>
										{row.receiptUrl && (
											<Button
												size="sm"
												variant="ghost"
												className="h-7 px-2"
												onClick={() =>
													setReceiptUrl(
														row.receiptUrl as string,
													)
												}
												aria-label="View receipt"
											>
												<ImageIcon className="size-3.5" />
											</Button>
										)}
										<span className="shrink-0 font-mono tabular-nums">
											{formatCurrency(row.amount)}
										</span>
										{canManage && (
											<Combobox
												className="h-8 w-44 text-xs"
												value={isNone ? "" : bucketId}
												onChange={(v) =>
													move(row.id, v || null)
												}
												options={[
													{
														value: "",
														label: "Needs a bucket",
													},
													...categories.map((c) => ({
														value: c.id,
														label: c.label,
													})),
												]}
												placeholder="Move to…"
												searchPlaceholder="Search buckets…"
												emptyText="No bucket matches"
												disabled={setBucket.isPending}
											/>
										)}
									</li>
								))}
							</ul>
						)}
					</ContentCard>
				</div>

				<div className="space-y-4">
					<ContentCard>
						<ContentCardSection className="border-b border-border">
							<div className="text-sm font-medium">
								What the money was
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">
								Last six months, grouped by description.
							</p>
						</ContentCardSection>
						{data.topLines.length === 0 ? (
							<p className="px-4 py-4 text-sm text-muted-foreground">
								Nothing in the last six months.
							</p>
						) : (
							<ul>
								{data.topLines.map((line) => (
									<li
										key={line.key}
										className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0"
									>
										<div className="min-w-0 flex-1">
											<div className="truncate">
												{line.sample}
											</div>
											<div className="text-xs text-muted-foreground">
												{line.count}{" "}
												{line.count === 1
													? "time"
													: "times"}
											</div>
										</div>
										<span className="shrink-0 font-mono tabular-nums">
											{formatCurrency(line.total)}
										</span>
									</li>
								))}
							</ul>
						)}
					</ContentCard>

					{!isNone && (
						<ContentCard>
							<ContentCardSection className="border-b border-border">
								<div className="text-sm font-medium">
									What feeds this bucket
								</div>
								<p className="mt-0.5 text-xs text-muted-foreground">
									Rules file matching descriptions here on
									approval. Recurring lines land here every
									month.
								</p>
							</ContentCardSection>
							{data.rules.length === 0 &&
							data.recurring.length === 0 ? (
								<p className="px-4 py-4 text-sm text-muted-foreground">
									Nothing automatic yet. Lines get here when
									someone picks this bucket.
								</p>
							) : (
								<ul>
									{data.recurring.map((r) => (
										<li
											key={r.id}
											className={cn(
												"flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0",
												!r.active && "opacity-60",
											)}
										>
											<RepeatIcon className="size-3.5 shrink-0 text-muted-foreground" />
											<div className="min-w-0 flex-1 truncate">
												{r.description}
												<span className="text-xs text-muted-foreground">
													{" "}
													· day {r.dayOfMonth}
													{!r.active && " · paused"}
												</span>
											</div>
											<span className="shrink-0 font-mono tabular-nums">
												{formatCurrency(r.amount)}
											</span>
										</li>
									))}
									{data.rules.map((rule) => (
										<li
											key={rule.id}
											className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0"
										>
											<WandSparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
											<div className="min-w-0 flex-1 truncate">
												<span className="text-muted-foreground">
													description{" "}
													{MATCH_WORDS[
														rule.matchType
													] ?? rule.matchType}{" "}
												</span>
												“{rule.pattern}”
											</div>
										</li>
									))}
								</ul>
							)}
						</ContentCard>
					)}
				</div>
			</div>

			{adding && (
				<AddExpenseSheet
					open
					onOpenChange={(o) => !o && setAdding(false)}
					bucketId={isNone ? null : bucketId}
				/>
			)}
			{recurringOpen && (
				<RecurringExpenseSheet
					open
					onOpenChange={setRecurringOpen}
					bucketId={isNone ? null : bucketId}
				/>
			)}
			{wizardOpen && <MoneyMapWizard open onOpenChange={setWizardOpen} />}
			{receiptUrl && (
				<ImageViewerDialog
					open
					onOpenChange={(o) => !o && setReceiptUrl(null)}
					src={receiptUrl}
					title="Receipt"
				/>
			)}
		</PageShell>
	);
}
