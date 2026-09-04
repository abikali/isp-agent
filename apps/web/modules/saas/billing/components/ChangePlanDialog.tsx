"use client";

import {
	useExecuteAccountTypeChange,
	usePlansQuery,
	usePreviewAccountTypeChange,
} from "@saas/customers/client";
import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Label } from "@ui/components/label";
import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ChangePlanDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	customerId: string;
	currentPlanId?: string | null;
}

type PreviewData = Awaited<
	ReturnType<ReturnType<typeof usePreviewAccountTypeChange>["mutateAsync"]>
>;

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single-dialog plan-change flow; sections share form/preview/mutation state and splitting would scatter tightly-coupled logic
export function ChangePlanDialog({
	open,
	onOpenChange,
	organizationId,
	customerId,
	currentPlanId,
}: ChangePlanDialogProps) {
	const { plans, isLoading: plansLoading } = usePlansQuery();
	const preview = usePreviewAccountTypeChange();
	const execute = useExecuteAccountTypeChange();
	const isExecuting = execute.isPending;

	const [newPlanId, setNewPlanId] = useState<string>("");
	const [previewData, setPreviewData] = useState<PreviewData | null>(null);
	const [result, setResult] = useState<{
		success: boolean;
		oldPlanName: string;
		newPlanName: string;
		disconnected?: boolean;
		error?: string;
	} | null>(null);

	const selectablePlans = plans.filter(
		(p) => p.externalId && p.id !== currentPlanId,
	);

	function reset() {
		setNewPlanId("");
		setPreviewData(null);
		setResult(null);
	}

	function handleOpenChange(next: boolean) {
		if (!next) {
			reset();
		}
		onOpenChange(next);
	}

	async function handlePreview() {
		if (!newPlanId) {
			return;
		}
		try {
			const data = await preview.mutateAsync({
				organizationId,
				customerId,
				newPlanId,
			});
			setPreviewData(data);
		} catch (err) {
			toast.error(
				`Failed to preview plan change: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		}
	}

	async function handleConfirm() {
		if (!previewData) {
			return;
		}
		try {
			const iRadiusResult = await execute.mutateAsync({
				organizationId,
				customerId,
				newPlanId,
			});
			setResult({
				success: true,
				oldPlanName: previewData.oldAccountType.name,
				newPlanName: previewData.newAccountType.name,
				disconnected: iRadiusResult.disconnected,
			});
		} catch (err) {
			setResult({
				success: false,
				oldPlanName: previewData.oldAccountType.name,
				newPlanName: previewData.newAccountType.name,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		}
	}

	if (result) {
		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-md">
					{result.success ? (
						<>
							<DialogHeader>
								<div className="flex items-center gap-2">
									<CheckCircle2Icon className="size-5 text-green-600" />
									<DialogTitle>
										Plan Changed Successfully
									</DialogTitle>
								</div>
								<DialogDescription>
									The plan has been updated in both iRadius
									and the local database.
								</DialogDescription>
							</DialogHeader>
							<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
								<span className="text-muted-foreground">
									Previous Plan:
								</span>
								<span>{result.oldPlanName}</span>
								<span className="text-muted-foreground">
									New Plan:
								</span>
								<span className="font-medium">
									{result.newPlanName}
								</span>
								<span className="text-muted-foreground">
									MikroTik:
								</span>
								<span>
									{result.disconnected
										? "User disconnected (will reconnect with new plan)"
										: "User was not online"}
								</span>
							</div>
						</>
					) : (
						<>
							<DialogHeader>
								<div className="flex items-center gap-2">
									<AlertCircleIcon className="size-5 text-destructive" />
									<DialogTitle>
										Plan Change Failed
									</DialogTitle>
								</div>
								<DialogDescription>
									The iRadius plan change could not be
									completed.
								</DialogDescription>
							</DialogHeader>
							<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
								{result.error}
							</div>
						</>
					)}
					<DialogFooter>
						<Button onClick={() => handleOpenChange(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change Plan</DialogTitle>
					<DialogDescription>
						{previewData
							? "Review the billing impact before confirming."
							: "Select a new plan to preview the billing impact."}
					</DialogDescription>
				</DialogHeader>

				{!previewData && (
					<div className="space-y-2">
						<Label htmlFor="change-plan-select">New plan</Label>
						<Combobox
							id="change-plan-select"
							value={newPlanId}
							onChange={setNewPlanId}
							options={selectablePlans.map((p) => ({
								value: p.id,
								label:
									p.monthlyPrice != null
										? `${p.name} — ${formatCurrency(p.monthlyPrice)}`
										: p.name,
							}))}
							placeholder={
								plansLoading
									? "Loading plans..."
									: "Select a plan"
							}
							searchPlaceholder="Search plans…"
							emptyText="No matching plans"
						/>
					</div>
				)}

				{previewData && (
					<div className="space-y-4">
						<div className="rounded-lg border p-3">
							<p className="mb-1 text-sm font-medium text-muted-foreground">
								Current Plan
							</p>
							<p className="font-medium">
								{previewData.oldAccountType.name}
							</p>
							<div className="mt-1 flex gap-4 text-sm text-muted-foreground">
								<span>
									Rate:{" "}
									{formatCurrency(
										previewData.oldAccountType.rate,
									)}
								</span>
								<span>
									Price:{" "}
									{formatCurrency(
										previewData.oldAccountType.sellingPrice,
									)}
								</span>
							</div>
						</div>

						<div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
							<p className="mb-1 text-sm font-medium text-muted-foreground">
								New Plan
							</p>
							<p className="font-medium">
								{previewData.newAccountType.name}
							</p>
							<div className="mt-1 flex gap-4 text-sm text-muted-foreground">
								<span>
									Rate:{" "}
									{formatCurrency(
										previewData.newAccountType.rate,
									)}
								</span>
								<span>
									Price:{" "}
									{formatCurrency(
										previewData.newAccountType.sellingPrice,
									)}
								</span>
							</div>
						</div>

						<div className="rounded-lg border p-3">
							<p className="mb-2 text-sm font-medium">
								Billing Impact
							</p>
							<div className="grid grid-cols-2 gap-2 text-sm">
								<span className="text-muted-foreground">
									Refund / Charge:
								</span>
								<span
									className={
										previewData.billing.refund < 0
											? "text-destructive"
											: "text-green-600"
									}
								>
									{formatCurrency(previewData.billing.refund)}
								</span>
								<span className="text-muted-foreground">
									Dealer Credit Before:
								</span>
								<span>
									{formatCurrency(
										previewData.billing.dealerCreditBefore,
									)}
								</span>
								<span className="text-muted-foreground">
									Dealer Credit After:
								</span>
								<span>
									{formatCurrency(
										previewData.billing.dealerCreditAfter,
									)}
								</span>
								<span className="text-muted-foreground">
									Quota Reset:
								</span>
								<span>
									{previewData.billing.quotaReset
										? "Yes"
										: "No"}
								</span>
							</div>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={preview.isPending || isExecuting}
					>
						Cancel
					</Button>
					{!previewData ? (
						<Button
							onClick={handlePreview}
							disabled={!newPlanId || preview.isPending}
						>
							{preview.isPending ? "Loading..." : "Preview"}
						</Button>
					) : (
						<Button onClick={handleConfirm} disabled={isExecuting}>
							{isExecuting ? "Changing..." : "Confirm Change"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
