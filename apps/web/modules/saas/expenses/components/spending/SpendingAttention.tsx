"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	AlertTriangleIcon,
	CameraOffIcon,
	CheckIcon,
	ClockIcon,
	LayersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { relativeDays } from "../../../dealers/lib/finance-labels";
import { useApproveExpense } from "../../hooks/use-expenses";
import type {
	AttentionClaim,
	SpendingOverview,
} from "../../hooks/use-spending";

interface SpendingAttentionProps {
	attention: SpendingOverview["attention"];
	totals: SpendingOverview["totals"];
	slug: string;
	canManage: boolean;
	onReject: (claim: AttentionClaim) => void;
	onViewReceipt: (url: string) => void;
}

/**
 * What needs a decision today. Three situations only — claims that have sat
 * too long, big claims with no photo, and money with no bucket. Anything
 * else lives in the table.
 */
export function SpendingAttention({
	attention,
	totals,
	slug,
	canManage,
	onReject,
	onViewReceipt,
}: SpendingAttentionProps) {
	const organizationId = useOrganizationId();
	const approve = useApproveExpense();
	const { staleClaims, noReceiptClaims } = attention;
	const showUnclassified = totals.unclassifiedCount > 0;

	if (
		staleClaims.length === 0 &&
		noReceiptClaims.length === 0 &&
		!showUnclassified
	) {
		return null;
	}

	async function approveClaim(claim: AttentionClaim) {
		if (!organizationId) {
			return;
		}
		try {
			await approve.mutateAsync({ organizationId, id: claim.id });
			toast.success(
				`${formatCurrency(claim.amount)} approved for ${claim.submittedBy?.name ?? "the worker"}.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not approve",
			);
		}
	}

	const lanes = [
		{
			key: "stale",
			icon: ClockIcon,
			title: "Waiting too long",
			blurb: "Claims older than three days. The worker is out of pocket meanwhile.",
			claims: staleClaims,
		},
		{
			key: "receipt",
			icon: CameraOffIcon,
			title: "Big, and no photo",
			blurb: "Worth a question before it is approved.",
			claims: noReceiptClaims.filter(
				(c) => !staleClaims.some((s) => s.id === c.id),
			),
		},
	].filter((lane) => lane.claims.length > 0);

	return (
		<section className="rounded-xl border border-warning/30 bg-warning/[0.04] p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<AlertTriangleIcon className="size-4 text-warning" />
				Needs a look
			</div>
			<div
				className={cn(
					"mt-3 grid gap-4",
					lanes.length + (showUnclassified ? 1 : 0) > 1 &&
						"lg:grid-cols-2",
				)}
			>
				{lanes.map((lane) => (
					<div key={lane.key}>
						<div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							<lane.icon className="size-3.5" />
							{lane.title}
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{lane.blurb}
						</p>
						<ul className="mt-2 space-y-1.5">
							{lane.claims.map((claim) => (
								<li
									key={claim.id}
									className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
								>
									<div className="min-w-0 flex-1">
										<div className="truncate">
											<span className="font-medium">
												{claim.submittedBy?.name ??
													"Direct"}
											</span>
											<span className="text-muted-foreground">
												{" "}
												· {claim.description}
											</span>
										</div>
										<div className="text-xs text-muted-foreground">
											{relativeDays(claim.createdAt)}
											{claim.receiptUrl ? (
												<>
													{" · "}
													<button
														type="button"
														className="underline"
														onClick={() =>
															onViewReceipt(
																claim.receiptUrl as string,
															)
														}
													>
														receipt
													</button>
												</>
											) : (
												" · no photo"
											)}
										</div>
									</div>
									<span className="shrink-0 font-mono tabular-nums">
										{formatCurrency(claim.amount)}
									</span>
									{canManage && (
										<div className="flex shrink-0 gap-1">
											<Button
												size="sm"
												variant="outline"
												className="h-7 px-2"
												disabled={approve.isPending}
												onClick={() =>
													approveClaim(claim)
												}
											>
												<CheckIcon className="size-3.5" />
											</Button>
											<Button
												size="sm"
												variant="ghost"
												className="h-7 px-2"
												onClick={() => onReject(claim)}
											>
												Reject
											</Button>
										</div>
									)}
								</li>
							))}
						</ul>
					</div>
				))}

				{showUnclassified && (
					<div>
						<div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							<LayersIcon className="size-3.5" />
							Money with no bucket
						</div>
						<p className="mt-0.5 text-xs text-muted-foreground">
							The P&L cannot tell you where it went until it has
							one.
						</p>
						<div className="mt-2 flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
							<div className="min-w-0 flex-1">
								<span className="font-medium">
									{formatCurrency(totals.unclassified)}
								</span>
								<span className="text-muted-foreground">
									{" "}
									across {totals.unclassifiedCount} approved{" "}
									{totals.unclassifiedCount === 1
										? "line"
										: "lines"}
								</span>
							</div>
							<Button size="sm" variant="outline" asChild>
								<Link
									to="/app/$organizationSlug/expenses/$bucketId"
									params={{
										organizationSlug: slug,
										bucketId: "none",
									}}
								>
									Sort them
								</Link>
							</Button>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
