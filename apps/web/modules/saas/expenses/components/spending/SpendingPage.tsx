"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PageShell } from "@shared/components/PageShell";
import { Button } from "@ui/components/button";
import { PlusIcon, RepeatIcon } from "lucide-react";
import { useState } from "react";
import {
	type AttentionClaim,
	type RecurringLine,
	useSpendingOverview,
} from "../../hooks/use-spending";
import { ExpensesList, type RejectTarget } from "../ExpensesList";
import { AddExpenseSheet } from "./AddExpenseSheet";
import { BucketGrid } from "./BucketGrid";
import { RecurringExpenseSheet } from "./RecurringExpenseSheet";
import { RecurringSection } from "./RecurringSection";
import { SpendingAttention } from "./SpendingAttention";
import { type SpendingFilter, SpendingTotals } from "./SpendingTotals";

/**
 * The owner's spending page.
 *
 * Reads top to bottom as: how much went out → what needs a decision → where
 * it went → what repeats → every line. Every number is a filter, every
 * bucket is a link, and both ways of adding money are reachable without
 * leaving the page.
 */
export function SpendingPage() {
	const overview = useSpendingOverview();
	const { activeOrganization } = useActiveOrganization();
	const slug = activeOrganization?.slug ?? "";

	const [filter, setFilter] = useState<SpendingFilter>("all");
	const [adding, setAdding] = useState(false);
	const [recurring, setRecurring] = useState<{
		line: RecurringLine | null;
	} | null>(null);
	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<RejectTarget | null>(null);

	const { canManage } = overview;

	return (
		<PageShell
			title="Spending"
			description="What the business pays out, what workers are waiting to get back, and what still needs a bucket."
			actions={
				canManage ? (
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setRecurring({ line: null })}
						>
							<RepeatIcon className="size-4" />
							Repeat monthly
						</Button>
						<Button size="sm" onClick={() => setAdding(true)}>
							<PlusIcon className="size-4" />
							Add expense
						</Button>
					</div>
				) : undefined
			}
		>
			<SpendingTotals
				totals={overview.totals}
				periodLabel={overview.periodLabel}
				filter={filter}
				onFilter={setFilter}
			/>

			<SpendingAttention
				attention={overview.attention}
				totals={overview.totals}
				slug={slug}
				canManage={canManage}
				onReject={(claim: AttentionClaim) =>
					setRejecting({
						id: claim.id,
						amount: claim.amount,
						who: claim.submittedBy?.name ?? "this",
					})
				}
				onViewReceipt={setReceiptUrl}
			/>

			<BucketGrid
				buckets={overview.buckets}
				periodLabel={overview.periodLabel}
				slug={slug}
			/>

			<RecurringSection
				lines={overview.recurring}
				total={overview.recurringTotal}
				canManage={canManage}
				onAdd={() => setRecurring({ line: null })}
				onEdit={(line) => setRecurring({ line })}
			/>

			<ExpensesList
				key={filter}
				embedded
				preset={filter}
				rejecting={rejecting}
				onRejectingChange={setRejecting}
			/>

			{adding && (
				<AddExpenseSheet
					open
					onOpenChange={(o) => !o && setAdding(false)}
				/>
			)}

			{recurring && (
				<RecurringExpenseSheet
					key={recurring.line?.id ?? "new"}
					open
					onOpenChange={(o) => !o && setRecurring(null)}
					line={recurring.line}
				/>
			)}

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
