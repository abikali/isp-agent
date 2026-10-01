"use client";

import { formatCurrency, formatDate } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Skeleton } from "@ui/components/skeleton";
import { Switch } from "@ui/components/switch";
import { CheckCircle2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAlignToFirst, useAlignToFirstPreview } from "../hooks/use-billing";

export interface AlignToFirstTarget {
	/** One of the two: a collection under review, or an invoice before collection. */
	paymentId?: string;
	invoiceId?: string;
	customerName: string;
}

interface AlignToFirstDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	target: AlignToFirstTarget;
}

/**
 * "Align to 1st": the customer paid for the days up to the 1st so the bill
 * comes out on the 1st from now on. The expiry moves to the 1st 23:59 in
 * iRadius with the dealer charged the prorated wholesale Rate (like the
 * native "Add Day … Manage Dealer Credit"), and the month's invoice is
 * prorated to what those days cost the customer.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- one dialog: preview, form and result share state
export function AlignToFirstDialog({
	open,
	onOpenChange,
	organizationId,
	target,
}: AlignToFirstDialogProps) {
	const [chargeDealer, setChargeDealer] = useState(true);
	const [billableDays, setBillableDays] = useState<string | null>(null);
	const [amount, setAmount] = useState<string | null>(null);
	const align = useAlignToFirst();
	const [result, setResult] = useState<Awaited<
		ReturnType<typeof align.mutateAsync>
	> | null>(null);

	const daysOverride =
		billableDays !== null && /^\d+$/.test(billableDays)
			? Number(billableDays)
			: undefined;
	const baseInput = {
		organizationId,
		...(target.paymentId
			? { paymentId: target.paymentId }
			: { invoiceId: target.invoiceId }),
		chargeDealer,
		...(daysOverride !== undefined ? { billableDays: daysOverride } : {}),
	};
	const preview = useAlignToFirstPreview(open && !result ? baseInput : null);
	const data = preview.data;

	const amountValue =
		amount !== null ? Number.parseFloat(amount) : data?.suggestedAmount;
	const amountInvalid =
		amountValue === undefined ||
		!Number.isFinite(amountValue) ||
		amountValue < 0;

	function handleOpenChange(next: boolean) {
		if (!next) {
			setChargeDealer(true);
			setBillableDays(null);
			setAmount(null);
			setResult(null);
		}
		onOpenChange(next);
	}

	async function handleApply() {
		if (!data || amountInvalid) {
			return;
		}
		try {
			setResult(
				await align.mutateAsync({
					...baseInput,
					targetExpiry: data.target,
					amount: amountValue,
				}),
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to align to 1st",
			);
		}
	}

	if (result) {
		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<div className="flex items-center gap-2">
							<CheckCircle2Icon className="size-5 text-green-600" />
							<DialogTitle>Aligned to the 1st</DialogTitle>
						</div>
						<DialogDescription>
							{target.customerName} now expires on{" "}
							{formatDate(result.newExpiry)} 23:59.
						</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
						<span className="text-muted-foreground">
							Days added:
						</span>
						<span>{result.days}</span>
						<span className="text-muted-foreground">
							Dealer charged:
						</span>
						<span>{formatCurrency(result.dealerCharge)}</span>
						<span className="text-muted-foreground">
							Month now due:
						</span>
						<span className="font-medium">
							{formatCurrency(result.invoiceTotal)}
						</span>
						<span className="text-muted-foreground">
							Remaining:
						</span>
						<span
							className={
								result.remaining > 0
									? "text-destructive"
									: "text-green-600"
							}
						>
							{formatCurrency(result.remaining)}
						</span>
					</div>
					<DialogFooter>
						<Button onClick={() => handleOpenChange(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	const dealer = data?.dealer;
	const hoursAdded = (data?.days ?? 0) * 24;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Align to the 1st</DialogTitle>
					<DialogDescription>
						{target.customerName}: move the expiry to the 1st at
						23:59 and bill only the days up to it, so the next bill
						comes out on the 1st.
					</DialogDescription>
				</DialogHeader>

				{preview.isPending && open ? (
					<div className="space-y-2">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				) : preview.error ? (
					<p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
						{preview.error.message}
					</p>
				) : data ? (
					<div className="space-y-4">
						<div className="rounded-lg border p-3 text-sm">
							{data.alreadyAligned ? (
								<p className="text-muted-foreground">
									The expiry is already{" "}
									{formatDate(data.targetExpiry)} 23:59 —
									nothing to add in iRadius. Enter the days
									the customer is billed for.
								</p>
							) : (
								<p className="text-muted-foreground">
									Adds {data.days}{" "}
									{data.days === 1 ? "day" : "days"}:{" "}
									{formatDate(data.base)} →{" "}
									{formatDate(data.targetExpiry)} 23:59
								</p>
							)}
							<p className="mt-1 font-medium tabular-nums">
								{data.billableDays} days ×{" "}
								{formatCurrency(data.monthlyDue)} /{" "}
								{Number(data.periodDays.toFixed(2))} ={" "}
								{formatCurrency(data.formulaAmount)} →{" "}
								{formatCurrency(data.suggestedAmount)}
							</p>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="align-days">
									Billable days
								</Label>
								<Input
									id="align-days"
									type="number"
									min="0"
									max="62"
									value={
										billableDays ??
										String(data.billableDays)
									}
									onChange={(e) => {
										setBillableDays(e.target.value);
										setAmount(null);
									}}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="align-amount">
									Customer pays
								</Label>
								<Input
									id="align-amount"
									type="number"
									step="0.01"
									min="0"
									value={
										amount ?? String(data.suggestedAmount)
									}
									onChange={(e) => setAmount(e.target.value)}
								/>
							</div>
						</div>

						{dealer && !data.alreadyAligned && (
							<div className="space-y-2 rounded-lg border p-3 text-sm">
								{dealer.noCharge ? (
									<p className="text-muted-foreground">
										Dealer {dealer.name} is set to no charge
										in iRadius.
									</p>
								) : chargeDealer ? (
									<p>
										Dealer {dealer.name} charged{" "}
										<span className="font-medium">
											{formatCurrency(dealer.charge)}
										</span>{" "}
										<span className="text-muted-foreground">
											(Rate {formatCurrency(dealer.rate)}{" "}
											× {hoursAdded}h /{" "}
											{dealer.periodHours}h)
											{dealer.credit !== null &&
												` · credit left ${formatCurrency(dealer.credit - dealer.charge)}`}
										</span>
									</p>
								) : (
									<p className="text-amber-700 dark:text-amber-400">
										{data.days} free{" "}
										{data.days === 1 ? "day" : "days"}:
										dealer not charged (would be{" "}
										{formatCurrency(dealer.wouldCharge)}).
									</p>
								)}
								{data.canToggleCharge && !dealer.noCharge && (
									<div className="flex items-center justify-between gap-3">
										<Label htmlFor="align-charge">
											Charge dealer for added days
										</Label>
										<Switch
											id="align-charge"
											checked={chargeDealer}
											onCheckedChange={setChargeDealer}
										/>
									</div>
								)}
							</div>
						)}

						<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
							<span className="text-muted-foreground">
								Invoice:
							</span>
							<span>
								{formatCurrency(data.invoice.total)} →{" "}
								{formatCurrency(
									amountInvalid ? 0 : amountValue,
								)}
							</span>
							{data.paidAmount !== null && (
								<>
									<span className="text-muted-foreground">
										Collected:
									</span>
									<span>
										{formatCurrency(data.paidAmount)}
									</span>
								</>
							)}
							{data.nextInvoice && (
								<>
									<span className="text-muted-foreground">
										Next bill:
									</span>
									<span>
										due date moves to{" "}
										{formatDate(data.targetExpiry)}
									</span>
								</>
							)}
						</div>
					</div>
				) : null}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={align.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={handleApply}
						disabled={!data || amountInvalid || align.isPending}
					>
						{align.isPending
							? "Applying..."
							: target.paymentId
								? "Align & mark reviewed"
								: "Align"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
