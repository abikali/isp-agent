"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { PageShell } from "@shared/components/PageShell";
import { Button } from "@ui/components/button";
import { HandCoinsIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import {
	type DealerFinanceRow,
	useDealerFinanceOverview,
} from "../../hooks/use-dealer-finance";
import type { PaymentKind } from "../../lib/finance-labels";
import { AdjustCreditSheet } from "./AdjustCreditSheet";
import { DealerAttention } from "./DealerAttention";
import { DealerSyncButton } from "./DealerSyncButton";
import { DealerTable } from "./DealerTable";
import { type DealerFilter, DealerTotals } from "./DealerTotals";
import { OrphanBalances } from "./OrphanBalances";
import { RecordPaymentSheet } from "./RecordPaymentSheet";

interface PaymentIntent {
	dealer: DealerFinanceRow | null;
	kind: PaymentKind;
}

/**
 * The owner's dealer page.
 *
 * Reads top to bottom as: how much am I owed → who needs a call → everyone.
 * Every number is a filter, every dealer is a link, and both money actions are
 * reachable without leaving the page.
 */
export function DealerFinancePage() {
	const overview = useDealerFinanceOverview();
	const { activeOrganization } = useActiveOrganization();
	const slug = activeOrganization?.slug ?? "";

	const [filter, setFilter] = useState<DealerFilter>("all");
	const [payment, setPayment] = useState<PaymentIntent | null>(null);
	const [credit, setCredit] = useState<{
		dealer: DealerFinanceRow | null;
	} | null>(null);

	const { canManage, isOperator } = overview;
	const pickable = [...overview.dealers, ...overview.orphans];

	return (
		<PageShell
			title={isOperator ? "Dealers" : "Your account with the operator"}
			description={
				isOperator
					? "Who owes you, who is running out of credit, and what to do about it."
					: "What you owe for credit you were given, and how much is left to spend."
			}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					<DealerSyncButton
						lastSyncedAt={overview.lastSyncedAt}
						runningOperationId={
							overview.sync?.running
								? overview.sync.operationId
								: null
						}
						canManage={canManage}
					/>
					{canManage && (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									setPayment({
										dealer: null,
										kind: "payment",
									})
								}
							>
								<HandCoinsIcon className="size-4" />
								Record payment
							</Button>
							<Button
								size="sm"
								onClick={() => setCredit({ dealer: null })}
							>
								<PlusIcon className="size-4" />
								Add credit
							</Button>
						</>
					)}
				</div>
			}
		>
			<DealerTotals
				totals={overview.totals}
				periodLabel={overview.periodLabel}
				isOperator={isOperator}
				filter={filter}
				onFilter={setFilter}
			/>

			{isOperator && (
				<DealerAttention
					dealers={overview.dealers}
					slug={slug}
					canManage={canManage}
					onRecordPayment={(dealer) =>
						setPayment({ dealer, kind: "payment" })
					}
					onAddCredit={(dealer) => setCredit({ dealer })}
				/>
			)}

			<DealerTable
				dealers={overview.dealers}
				slug={slug}
				isOperator={isOperator}
				canManage={canManage}
				filter={filter}
				onFilter={setFilter}
				onRecordPayment={(dealer) =>
					setPayment({ dealer, kind: "payment" })
				}
				onAddCredit={(dealer) => setCredit({ dealer })}
			/>

			<OrphanBalances
				orphans={overview.orphans}
				total={overview.totals.orphanOwed}
				canManage={canManage}
				onWriteOff={(dealer) =>
					setPayment({ dealer, kind: "write_off" })
				}
			/>

			{payment && (
				<RecordPaymentSheet
					key={payment.dealer?.id ?? "pick"}
					open
					onOpenChange={(open) => {
						if (!open) {
							setPayment(null);
						}
					}}
					dealer={
						payment.dealer
							? {
									id: payment.dealer.id,
									name: payment.dealer.name,
									owed: payment.dealer.owed,
									isDeleted: payment.dealer.isDeleted,
								}
							: null
					}
					dealers={pickable.map((d) => ({
						id: d.id,
						name: d.name,
						owed: d.owed,
						isDeleted: d.isDeleted,
					}))}
					initialKind={payment.kind}
				/>
			)}

			{credit && (
				<AdjustCreditSheet
					key={credit.dealer?.id ?? "pick"}
					open
					onOpenChange={(open) => {
						if (!open) {
							setCredit(null);
						}
					}}
					dealer={
						credit.dealer
							? {
									id: credit.dealer.id,
									name: credit.dealer.name,
									owed: credit.dealer.owed,
									prepaid: credit.dealer.prepaid,
								}
							: null
					}
					dealers={overview.dealers.map((d) => ({
						id: d.id,
						name: d.name,
						owed: d.owed,
						prepaid: d.prepaid,
					}))}
				/>
			)}
		</PageShell>
	);
}
