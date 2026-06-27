"use client";

import { useSession } from "@saas/auth/client";
import { useOrganizationId } from "@shared/lib/organization";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { RadioGroup, RadioGroupItem } from "@ui/components/radio-group";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCurrentMonth, useResetMonth } from "../hooks/use-billing";
import { formatCycleLong } from "../lib/billing-utils";

const CONFIRM_PHRASE = "RESET";

type ResetMode = "void" | "delete";

export function ResetMonthCard() {
	const { user } = useSession();
	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;

	if (user?.role !== "admin" || !activeMonth || activeMonth.locked) {
		return null;
	}

	const label = formatCycleLong(activeMonth.year, activeMonth.month);

	return (
		<Card className="border-2 border-destructive/40 bg-destructive/5">
			<CardContent className="py-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-3">
						<RotateCcwIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
						<div>
							<div className="text-sm font-semibold text-destructive">
								Critical: Reset Month
							</div>
							<p className="mt-1 text-sm text-muted-foreground">
								Clears all payments and invoices for {label} so
								it behaves as if it was never opened. Use this
								when an org trialed the cycle and wants a clean
								start — before the month is locked.
							</p>
						</div>
					</div>
					<ResetConfirmDialog
						label={label}
						billingMonthId={activeMonth.id}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function ResetConfirmDialog({
	label,
	billingMonthId,
}: {
	label: string;
	billingMonthId: string;
}) {
	const organizationId = useOrganizationId();
	const reset = useResetMonth();
	const [open, setOpen] = useState(false);
	const [phrase, setPhrase] = useState("");
	const [mode, setMode] = useState<ResetMode>("void");

	const canSubmit = phrase === CONFIRM_PHRASE && !reset.isPending;

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setPhrase("");
			setMode("void");
		}
	}

	function handleConfirm() {
		if (!organizationId || !canSubmit) {
			return;
		}
		reset.mutate(
			{
				organizationId,
				billingMonthId,
				mode,
				confirmation: CONFIRM_PHRASE,
			},
			{
				onSuccess: ({
					deletedPayments,
					voidedInvoices,
					deletedInvoices,
				}) => {
					const invoicePart =
						deletedInvoices > 0
							? `${deletedInvoices} invoice${deletedInvoices === 1 ? "" : "s"} deleted`
							: `${voidedInvoices} invoice${voidedInvoices === 1 ? "" : "s"} voided`;
					toast.success(
						`Month reset — ${invoicePart}, ${deletedPayments} payment${deletedPayments === 1 ? "" : "s"} removed`,
					);
					handleOpenChange(false);
				},
				onError: (error) => {
					toast.error(error.message ?? "Failed to reset month");
				},
			},
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" size="sm">
					<RotateCcwIcon className="mr-1.5 size-3.5" />
					Reset Month
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<AlertTriangleIcon className="size-5 text-destructive" />
						Reset {label}?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							<p>
								This removes <strong>all payments</strong> for{" "}
								{label} (reactivating any stopped customers in
								iRadius) and clears the month&apos;s invoices.
								Afterwards the month behaves as if it was never
								opened.
							</p>
							<Alert variant="error">
								<AlertTriangleIcon />
								<AlertTitle>Critical action</AlertTitle>
								<AlertDescription>
									This affects collector views, unpaid lists,
									and billing totals for the entire
									organization. It cannot be undone.
								</AlertDescription>
							</Alert>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-3">
					<Label>How to handle the invoices</Label>
					<RadioGroup
						value={mode}
						onValueChange={(v) => setMode(v as ResetMode)}
						className="gap-3"
					>
						<label
							htmlFor="reset-mode-void"
							className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
						>
							<RadioGroupItem
								id="reset-mode-void"
								value="void"
								className="mt-0.5"
							/>
							<div className="text-sm">
								<div className="font-medium">
									Void (keep for audit)
								</div>
								<p className="text-muted-foreground">
									Soft-deletes invoices — hidden from every
									billing view but kept as a record.
									Reversible.
								</p>
							</div>
						</label>
						<label
							htmlFor="reset-mode-delete"
							className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
						>
							<RadioGroupItem
								id="reset-mode-delete"
								value="delete"
								className="mt-0.5"
							/>
							<div className="text-sm">
								<div className="font-medium">
									Hard delete (gone entirely)
								</div>
								<p className="text-muted-foreground">
									Removes invoice rows permanently. No audit
									trail.
								</p>
							</div>
						</label>
					</RadioGroup>
				</div>

				<div className="space-y-2">
					<Label htmlFor="reset-confirm">
						Type{" "}
						<span className="font-mono font-semibold">
							{CONFIRM_PHRASE}
						</span>{" "}
						to confirm
					</Label>
					<Input
						id="reset-confirm"
						value={phrase}
						onChange={(e) => setPhrase(e.target.value)}
						placeholder={CONFIRM_PHRASE}
						autoComplete="off"
						autoFocus
					/>
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={!canSubmit}
						onClick={handleConfirm}
					>
						{reset.isPending ? "Resetting..." : "Reset Month"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
