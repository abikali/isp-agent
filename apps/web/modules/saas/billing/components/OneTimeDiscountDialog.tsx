"use client";

import { formatCurrency } from "@shared/lib/format";
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
import { useState } from "react";
import { toast } from "sonner";
import { useApplyOneTimeDiscount } from "../hooks/use-billing";
import { parseAmount } from "../lib/billing-utils";

export interface OneTimeDiscountTarget {
	invoiceId: string;
	label: string;
	total: number;
	note: string | null;
}

interface OneTimeDiscountDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	invoice: OneTimeDiscountTarget;
}

/**
 * "This month only" discount: lowers one invoice. The customer's price and
 * iRadius stay as they are, so next month bills the normal amount.
 */
export function OneTimeDiscountDialog({
	open,
	onOpenChange,
	organizationId,
	invoice,
}: OneTimeDiscountDialogProps) {
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const apply = useApplyOneTimeDiscount();
	const amountNum = parseAmount(amount);
	const tooMuch = amountNum > invoice.total + 0.001;
	const canApply = amountNum > 0 && !tooMuch && reason.trim().length > 0;

	function handleOpenChange(next: boolean) {
		if (!next) {
			setAmount("");
			setReason("");
		}
		onOpenChange(next);
	}

	function handleApply() {
		apply.mutate(
			{
				organizationId,
				invoiceId: invoice.invoiceId,
				amount: amountNum,
				reason: reason.trim(),
			},
			{
				onSuccess: (result) => {
					toast.success(
						`Invoice now ${formatCurrency(result.total)} — this month only`,
					);
					handleOpenChange(false);
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>One-time discount</DialogTitle>
					<DialogDescription>
						{invoice.label}: lower this invoice only. The customer's
						price in iRadius and next month's bill don't change.
					</DialogDescription>
				</DialogHeader>
				{invoice.note && (
					<p className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">
						{invoice.note}
					</p>
				)}
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-2">
						<Label htmlFor="one-time-amount">Discount</Label>
						<Input
							id="one-time-amount"
							type="number"
							step="0.01"
							min="0"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Invoice after</Label>
						<p className="pt-2 text-sm font-medium tabular-nums">
							{formatCurrency(invoice.total)} →{" "}
							{formatCurrency(
								Math.max(0, invoice.total - amountNum),
							)}
						</p>
					</div>
				</div>
				{tooMuch && (
					<p className="text-sm text-destructive">
						The discount is more than the invoice (
						{formatCurrency(invoice.total)}).
					</p>
				)}
				<div className="space-y-2">
					<Label htmlFor="one-time-reason">Reason</Label>
					<Input
						id="one-time-reason"
						value={reason}
						maxLength={200}
						onChange={(e) => setReason(e.target.value)}
						placeholder="e.g. outage last week"
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={apply.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={handleApply}
						disabled={!canApply || apply.isPending}
					>
						{apply.isPending ? "Applying..." : "Apply this month"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
