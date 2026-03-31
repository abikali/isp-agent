"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
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
import { Skeleton } from "@ui/components/skeleton";
import {
	LockIcon,
	LockOpenIcon,
	ReceiptIcon,
	ShieldAlertIcon,
} from "lucide-react";
import { useState } from "react";
import {
	useBillingMonths,
	useCurrentMonth,
	useToggleMonthLock,
} from "../hooks/use-billing";
import { formatCycleLong } from "../lib/billing-utils";

export function BillingCycleManager() {
	const organizationId = useOrganizationId();
	const {
		data: currentMonthData,
		isLoading: currentLoading,
		error: currentError,
	} = useCurrentMonth();
	const {
		data: monthsData,
		isLoading: monthsLoading,
		error: monthsError,
	} = useBillingMonths();
	const toggleLock = useToggleMonthLock();

	if (currentLoading || monthsLoading) {
		return <BillingCycleManagerSkeleton />;
	}

	if (currentError || monthsError) {
		return (
			<Card className="border-destructive/20">
				<CardContent className="py-4 text-sm text-destructive">
					Failed to load billing month:{" "}
					{(currentError ?? monthsError)?.message}
				</CardContent>
			</Card>
		);
	}

	const activeMonth = currentMonthData?.month;
	const months = monthsData?.months ?? [];

	if (!activeMonth) {
		return null;
	}

	const activeMonthId = activeMonth.id;
	const activeYear = activeMonth.year;
	const activeMonthNum = activeMonth.month;
	const activeLabel = formatCycleLong(activeYear, activeMonthNum);

	// Find stats for active month
	const activeStats = months.find((m) => m.id === activeMonthId);
	const paymentCount = activeStats?.paymentCount ?? 0;
	const totalCollected = activeStats?.totalCollected ?? 0;

	const isLocked = activeMonth.locked;

	function handleToggleLock() {
		if (!organizationId) {
			return;
		}
		toggleLock.mutate({
			organizationId,
			billingMonthId: activeMonthId,
			locked: !isLocked,
		});
	}

	return (
		<Card className="border-2 border-green-500/20 bg-green-50/30 dark:bg-green-950/10">
			<CardContent className="py-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					{/* Active period */}
					<div className="px-3 text-center sm:min-w-[160px]">
						<div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
							Active Period
						</div>
						<div className="text-lg font-semibold">
							{activeLabel}
						</div>
					</div>

					{/* Stats */}
					{paymentCount > 0 && (
						<div className="flex items-center justify-center gap-4 text-sm">
							<div className="flex items-center gap-1.5">
								<ReceiptIcon className="size-3.5 text-muted-foreground" />
								<span className="font-semibold tabular-nums">
									{paymentCount.toLocaleString()}
								</span>
								<span className="text-muted-foreground">
									payments
								</span>
							</div>
							<div className="text-muted-foreground">
								&middot;
							</div>
							<div className="font-semibold tabular-nums">
								{formatCurrency(totalCollected)}
							</div>
						</div>
					)}

					{/* Lock/Unlock Action */}
					<div className="flex items-center justify-center gap-2 sm:justify-end">
						{isLocked ? (
							<UnlockConfirmDialog
								label={activeLabel}
								isPending={toggleLock.isPending}
								onConfirm={handleToggleLock}
							/>
						) : (
							<LockConfirmDialog
								label={activeLabel}
								paymentCount={paymentCount}
								isPending={toggleLock.isPending}
								onConfirm={handleToggleLock}
							/>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Confirmation Dialogs ─────────────────────────────────────────

function LockConfirmDialog({
	label,
	paymentCount,
	isPending,
	onConfirm,
}: {
	label: string;
	paymentCount: number;
	isPending: boolean;
	onConfirm: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" size="sm" disabled={isPending}>
					<LockIcon className="mr-1.5 size-3.5" />
					{isPending ? "Locking..." : "Lock Month"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<ShieldAlertIcon className="size-5 text-destructive" />
						Lock {label}?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							<p>
								Locking this month will prevent new payments
								from being recorded for {label}.
							</p>
							{paymentCount > 0 && (
								<p className="text-sm text-muted-foreground">
									{paymentCount.toLocaleString()} payment
									{paymentCount !== 1 ? "s" : ""} in {label}{" "}
									will be preserved.
								</p>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={isPending}
						onClick={() => {
							onConfirm();
							setOpen(false);
						}}
					>
						{isPending ? "Locking..." : "Lock Month"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function UnlockConfirmDialog({
	label,
	isPending,
	onConfirm,
}: {
	label: string;
	isPending: boolean;
	onConfirm: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button variant="outline" size="sm" disabled={isPending}>
					<LockOpenIcon className="mr-1.5 size-3.5" />
					{isPending ? "Unlocking..." : "Unlock Month"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<ShieldAlertIcon className="size-5 text-amber-600" />
						Unlock {label}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						This will allow new payments to be recorded for {label}
						again.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						disabled={isPending}
						onClick={() => {
							onConfirm();
							setOpen(false);
						}}
					>
						{isPending ? "Unlocking..." : "Unlock Month"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function BillingCycleManagerSkeleton() {
	return <Skeleton className="h-20 w-full rounded-xl" />;
}
