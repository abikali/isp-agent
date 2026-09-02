"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { PageShell } from "@shared/components/PageShell";
import { Badge } from "@ui/components/badge";
import { useState } from "react";
import {
	useDealerFinanceLedger,
	useDealerFinanceOverview,
} from "../../hooks/use-dealer-finance";
import { AdjustCreditSheet } from "./AdjustCreditSheet";
import { DealerActivity } from "./DealerActivity";
import { DealerHero } from "./DealerHero";
import { DealerLedgerTimeline } from "./DealerLedgerTimeline";
import { RecordPaymentSheet } from "./RecordPaymentSheet";

interface DealerDetailPageProps {
	dealerId: string;
}

/**
 * One dealer: balances with their actions, the ledger as a timeline, and
 * what they have been spending. The overview is read alongside for the
 * per-dealer month figures so both pages agree to the cent.
 */
export function DealerDetailPage({ dealerId }: DealerDetailPageProps) {
	const ledger = useDealerFinanceLedger(dealerId);
	const overview = useDealerFinanceOverview();
	const { activeOrganization } = useActiveOrganization();
	const slug = activeOrganization?.slug ?? "";

	const [paymentOpen, setPaymentOpen] = useState(false);
	const [credit, setCredit] = useState<"add" | "deduct" | null>(null);

	const { dealer, summary, canManage } = ledger;
	const row =
		overview.dealers.find((d) => d.id === dealerId) ??
		overview.orphans.find((d) => d.id === dealerId);

	const subtitle = [
		dealer.companyName,
		dealer.username && `@${dealer.username}`,
		dealer.parentName && `under ${dealer.parentName}`,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<PageShell
			title={dealer.name}
			subtitle={subtitle || undefined}
			backTo={`/app/${slug}/dealers`}
			backLabel={overview.isOperator ? "All dealers" : "Your account"}
			badges={
				<>
					{dealer.isDeleted ? (
						<Badge variant="destructive">Deleted in iRadius</Badge>
					) : dealer.status !== "ACTIVE" ? (
						<Badge variant="secondary">Inactive</Badge>
					) : null}
					{!dealer.isLinked && (
						<Badge variant="outline">Not linked to iRadius</Badge>
					)}
				</>
			}
		>
			<DealerHero
				ledger={ledger}
				lastPaymentAt={row?.lastPaymentAt ?? null}
				chargedThisMonth={row?.chargedThisMonth ?? 0}
				canManage={canManage && !dealer.isDeleted}
				onRecordPayment={() => setPaymentOpen(true)}
				onAddCredit={() => setCredit("add")}
				onDeductCredit={() => setCredit("deduct")}
			/>

			{dealer.isDeleted && canManage && summary.owed > 0 && (
				<div className="rounded-lg border border-warning/30 bg-warning/[0.06] px-4 py-3 text-sm">
					This dealer was removed from iRadius but still owes{" "}
					<span className="font-medium">
						{summary.owed.toFixed(2)}
					</span>
					. The only thing left to do is{" "}
					<button
						type="button"
						className="font-medium underline"
						onClick={() => setPaymentOpen(true)}
					>
						write it off
					</button>
					.
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<DealerLedgerTimeline
						entries={ledger.entries}
						dealerName={dealer.name}
					/>
				</div>
				<DealerActivity
					activity={ledger.activity}
					summary={summary}
					customersCount={dealer.customersCount}
				/>
			</div>

			{paymentOpen && (
				<RecordPaymentSheet
					key={dealer.id}
					open
					onOpenChange={setPaymentOpen}
					dealer={{
						id: dealer.id,
						name: dealer.name,
						owed: summary.owed,
						isDeleted: dealer.isDeleted,
					}}
					initialKind={dealer.isDeleted ? "write_off" : "payment"}
				/>
			)}

			{credit && (
				<AdjustCreditSheet
					key={`${dealer.id}-${credit}`}
					open
					onOpenChange={(open) => {
						if (!open) {
							setCredit(null);
						}
					}}
					dealer={{
						id: dealer.id,
						name: dealer.name,
						owed: summary.owed,
						prepaid: summary.prepaid,
					}}
					initialDirection={credit}
				/>
			)}
		</PageShell>
	);
}
