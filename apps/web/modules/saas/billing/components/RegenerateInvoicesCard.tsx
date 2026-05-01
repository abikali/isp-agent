"use client";

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
import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useCurrentMonth,
	useRegenerateMonthInvoices,
} from "../hooks/use-billing";
import { formatCycleLong } from "../lib/billing-utils";

const CONFIRM_PHRASE = "REGENERATE";

export function RegenerateInvoicesCard() {
	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;

	if (!activeMonth || activeMonth.locked) {
		return null;
	}

	const label = formatCycleLong(activeMonth.year, activeMonth.month);

	return (
		<Card className="border-2 border-destructive/40 bg-destructive/5">
			<CardContent className="py-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-3">
						<AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
						<div>
							<div className="text-sm font-semibold text-destructive">
								Critical: Regenerate Invoices
							</div>
							<p className="mt-1 text-sm text-muted-foreground">
								Backfills missing invoices for {label}. Use this
								only if customers are missing from the unpaid
								list (e.g. they were synced after the cycle was
								opened).
							</p>
						</div>
					</div>
					<RegenerateConfirmDialog
						label={label}
						billingMonthId={activeMonth.id}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function RegenerateConfirmDialog({
	label,
	billingMonthId,
}: {
	label: string;
	billingMonthId: string;
}) {
	const organizationId = useOrganizationId();
	const regenerate = useRegenerateMonthInvoices();
	const [open, setOpen] = useState(false);
	const [phrase, setPhrase] = useState("");

	const canSubmit = phrase === CONFIRM_PHRASE && !regenerate.isPending;

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) {
			setPhrase("");
		}
	}

	function handleConfirm() {
		if (!organizationId || !canSubmit) {
			return;
		}
		regenerate.mutate(
			{
				organizationId,
				billingMonthId,
				confirmation: CONFIRM_PHRASE,
			},
			{
				onSuccess: ({ created, skipped }) => {
					toast.success(
						`Created ${created} invoice${created === 1 ? "" : "s"}` +
							(skipped > 0
								? ` (${skipped} skipped — already existed)`
								: ""),
					);
					handleOpenChange(false);
				},
				onError: (error) => {
					toast.error(
						error.message ?? "Failed to regenerate invoices",
					);
				},
			},
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" size="sm">
					<AlertTriangleIcon className="mr-1.5 size-3.5" />
					Regenerate Invoices
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<AlertTriangleIcon className="size-5 text-destructive" />
						Regenerate {label} invoices?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							<p>
								This will create a `customer_invoice` row for
								every billable customer who doesn&apos;t already
								have one for {label}. Existing invoices are
								preserved.
							</p>
							<Alert variant="error">
								<AlertTriangleIcon />
								<AlertTitle>Critical action</AlertTitle>
								<AlertDescription>
									This affects collector views, unpaid lists,
									and billing totals for the entire
									organization. Only run if you understand the
									consequence.
								</AlertDescription>
							</Alert>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-2">
					<Label htmlFor="regenerate-confirm">
						Type{" "}
						<span className="font-mono font-semibold">
							{CONFIRM_PHRASE}
						</span>{" "}
						to confirm
					</Label>
					<Input
						id="regenerate-confirm"
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
						{regenerate.isPending
							? "Regenerating..."
							: "Regenerate Invoices"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
