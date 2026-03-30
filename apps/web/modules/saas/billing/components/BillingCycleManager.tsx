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
	ChevronLeftIcon,
	ChevronRightIcon,
	LockIcon,
	PlayIcon,
	ReceiptIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	UsersIcon,
} from "lucide-react";
import { useState } from "react";
import {
	useBillingCycles,
	useCloseCycle,
	useCurrentCycle,
	useResetCycle,
	useSetActiveCycle,
} from "../hooks/use-billing";
import { formatCycleLong } from "../lib/billing-utils";

export function BillingCycleManager() {
	const organizationId = useOrganizationId();
	const {
		data: currentCycleData,
		isLoading: currentLoading,
		error: currentError,
	} = useCurrentCycle();
	const {
		data: cyclesData,
		isLoading: cyclesLoading,
		error: cyclesError,
	} = useBillingCycles();
	const closeCycle = useCloseCycle();
	const resetCycle = useResetCycle();
	const setActiveCycle = useSetActiveCycle();

	if (currentLoading || cyclesLoading) {
		return <BillingCycleManagerSkeleton />;
	}

	if (currentError || cyclesError) {
		return (
			<Card className="border-destructive/20">
				<CardContent className="py-4 text-sm text-destructive">
					Failed to load billing cycle:{" "}
					{(currentError ?? cyclesError)?.message}
				</CardContent>
			</Card>
		);
	}

	const activeCycle = currentCycleData?.cycle;
	const cycles = cyclesData?.cycles ?? [];

	if (!activeCycle) {
		return null;
	}

	const activeCycleId = activeCycle.id;
	const activeYear = activeCycle.year;
	const activeMonth = activeCycle.month;
	const activeLabel = formatCycleLong(activeYear, activeMonth);

	// Find stats for active cycle
	const activeStats = cycles.find((c) => c.id === activeCycleId);
	const paymentCount = activeStats?.paymentCount ?? 0;
	const totalCollected = activeStats?.totalCollected ?? 0;

	const isClosed = activeCycle.status === "CLOSED";
	const anyPending =
		closeCycle.isPending ||
		resetCycle.isPending ||
		setActiveCycle.isPending;

	function moveActive(direction: -1 | 1) {
		if (!organizationId || anyPending) {
			return;
		}
		let newMonth = activeMonth + direction;
		let newYear = activeYear;
		if (newMonth < 1) {
			newMonth = 12;
			newYear -= 1;
		} else if (newMonth > 12) {
			newMonth = 1;
			newYear += 1;
		}
		setActiveCycle.mutate({
			organizationId,
			year: newYear,
			month: newMonth,
		});
	}

	function handleClose() {
		if (!organizationId) {
			return;
		}
		closeCycle.mutate(
			{ organizationId, cycleId: activeCycleId },
			{
				onSuccess: () => {
					// After closing, advance to next month
					if (!organizationId) {
						return;
					}
					let nextMonth = activeMonth + 1;
					let nextYear = activeYear;
					if (nextMonth > 12) {
						nextMonth = 1;
						nextYear += 1;
					}
					setActiveCycle.mutate({
						organizationId,
						year: nextYear,
						month: nextMonth,
					});
				},
			},
		);
	}

	function handleReset() {
		if (!organizationId) {
			return;
		}
		resetCycle.mutate({ organizationId, cycleId: activeCycleId });
	}

	return (
		<Card className="border-2 border-green-500/20 bg-green-50/30 dark:bg-green-950/10">
			<CardContent className="py-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					{/* Active period selector */}
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9"
							disabled={anyPending}
							onClick={() => moveActive(-1)}
						>
							<ChevronLeftIcon className="size-4" />
						</Button>
						<div className="px-3 text-center min-w-[160px]">
							<div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
								Active Period
							</div>
							<div className="text-lg font-semibold">
								{activeLabel}
							</div>
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9"
							disabled={anyPending}
							onClick={() => moveActive(1)}
						>
							<ChevronRightIcon className="size-4" />
						</Button>
					</div>

					{/* Stats */}
					{paymentCount > 0 && (
						<div className="flex items-center gap-4 text-sm">
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

					{/* Actions */}
					<div className="flex items-center gap-2">
						{isClosed ? (
							<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
								<LockIcon className="size-3.5" />
								Closed
							</div>
						) : (
							<>
								<ResetConfirmDialog
									label={activeLabel}
									paymentCount={paymentCount}
									isPending={resetCycle.isPending}
									disabled={anyPending}
									onConfirm={handleReset}
								/>
								<CloseAndAdvanceDialog
									label={activeLabel}
									nextLabel={formatCycleLong(
										activeMonth === 12
											? activeYear + 1
											: activeYear,
										activeMonth === 12
											? 1
											: activeMonth + 1,
									)}
									paymentCount={paymentCount}
									isPending={closeCycle.isPending}
									disabled={anyPending}
									onConfirm={handleClose}
								/>
							</>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Confirmation Dialogs ─────────────────────────────────────────

function CloseAndAdvanceDialog({
	label,
	nextLabel,
	paymentCount,
	isPending,
	disabled,
	onConfirm,
}: {
	label: string;
	nextLabel: string;
	paymentCount: number;
	isPending: boolean;
	disabled?: boolean;
	onConfirm: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button
					variant="destructive"
					size="sm"
					disabled={isPending || disabled}
				>
					<PlayIcon className="mr-1.5 size-3.5" />
					{isPending ? "Closing..." : "Close & Next Month"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<ShieldAlertIcon className="size-5 text-destructive" />
						Close {label} and move to {nextLabel}?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							<p>This will:</p>
							<div className="space-y-2 rounded-md bg-destructive/10 p-3 text-sm">
								<p className="flex items-start gap-2">
									<LockIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
									<span>
										<strong className="text-destructive">
											Close {label}
										</strong>{" "}
										— no more payments can be recorded for
										this month.
									</span>
								</p>
								<p className="flex items-start gap-2">
									<UsersIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
									<span>
										<strong className="text-destructive">
											Reset all customers to unpaid
										</strong>{" "}
										and start collecting for {nextLabel}.
									</span>
								</p>
							</div>
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
						{isPending
							? "Closing..."
							: `Close & Start ${nextLabel}`}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function ResetConfirmDialog({
	label,
	paymentCount,
	isPending,
	disabled,
	onConfirm,
}: {
	label: string;
	paymentCount: number;
	isPending: boolean;
	disabled?: boolean;
	onConfirm: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending || disabled}
				>
					<RefreshCwIcon className="mr-1.5 size-3.5" />
					{isPending ? "Resetting..." : "Reset"}
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						<ShieldAlertIcon className="size-5 text-amber-600" />
						Reset {label}?
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							<p>
								Start collection fresh — all customers will
								appear as unpaid again:
							</p>
							<div className="space-y-2 rounded-md bg-amber-500/10 p-3 text-sm">
								<p className="flex items-start gap-2">
									<UsersIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
									<span>
										<strong className="text-amber-700 dark:text-amber-400">
											All customers marked as unpaid
										</strong>{" "}
										in collectors' lists.
									</span>
								</p>
								<p className="flex items-start gap-2">
									<ReceiptIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
									<span>
										Collectors can keep recording payments
										normally.
									</span>
								</p>
							</div>
							{paymentCount > 0 && (
								<p className="text-sm text-muted-foreground">
									{paymentCount.toLocaleString()} existing
									payment
									{paymentCount !== 1 ? "s" : ""} will be
									preserved.
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
						{isPending ? "Resetting..." : "Yes, Reset"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function BillingCycleManagerSkeleton() {
	return <Skeleton className="h-20 w-full rounded-xl" />;
}
