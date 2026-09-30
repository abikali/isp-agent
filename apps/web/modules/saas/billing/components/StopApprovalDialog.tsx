"use client";

import { formatDate } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { RadioGroup, RadioGroupItem } from "@ui/components/radio-group";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useIRadiusBridgeStatus, useReviewPayment } from "../hooks/use-billing";

type StopAction = "inactive" | "delete";

const DAY_MS = 24 * 60 * 60 * 1000;

function errorCode(error: unknown): unknown {
	return typeof error === "object" && error !== null && "code" in error
		? (error as { code?: unknown }).code
		: undefined;
}

/**
 * Approving a stopped payment: "Inactive only" (the default) or "Inactive +
 * delete from iRadius and CP". Delete is permanent in iRadius, so it is
 * disabled while the iRadius bridge is missing, and a "still owes months"
 * refusal can be overridden explicitly.
 */
export function StopApprovalDialog({
	organizationId,
	payment,
	onOpenChange,
	onIradiusUserMissing,
}: {
	organizationId: string;
	payment: {
		id: string;
		customerName: string;
		expiresAt: string | Date | null;
		linked: boolean;
	};
	onOpenChange: (open: boolean) => void;
	/** "Inactive only" hit a customer already deleted in iRadius. */
	onIradiusUserMissing: () => void;
}) {
	const [action, setAction] = useState<StopAction>("inactive");
	const [owedWarning, setOwedWarning] = useState<string | null>(null);
	const reviewPayment = useReviewPayment();
	const bridge = useIRadiusBridgeStatus(payment.linked);
	const bridgeMissing = payment.linked && bridge.data?.status === "missing";

	const expiry = payment.expiresAt ? new Date(payment.expiresAt) : null;
	const refundDays =
		expiry && expiry.getTime() > Date.now()
			? Math.floor((expiry.getTime() - Date.now()) / DAY_MS)
			: 0;

	function submit(ignoreOwedMonths: boolean) {
		reviewPayment.mutate(
			{
				organizationId,
				paymentId: payment.id,
				stopAction: action,
				...(ignoreOwedMonths ? { ignoreOwedMonths: true } : {}),
			},
			{
				onSuccess: (result) => {
					if (result.alreadyReviewed) {
						toast.info("Already reviewed");
					} else {
						toast.success(
							action === "delete"
								? "Deactivated and deleted"
								: "Approved & deactivated",
						);
					}
					onOpenChange(false);
				},
				onError: (error) => {
					const code = errorCode(error);
					if (code === "IRADIUS_USER_MISSING") {
						onIradiusUserMissing();
						return;
					}
					if (code === "CONFLICT" && action === "delete") {
						setOwedWarning(error.message);
						return;
					}
					toast.error(error.message);
				},
			},
		);
	}

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Approve stop</DialogTitle>
					<DialogDescription>
						{payment.customerName} stopped their subscription. How
						should it be closed?
					</DialogDescription>
				</DialogHeader>

				<RadioGroup
					value={action}
					onValueChange={(v) => {
						setAction(v as StopAction);
						setOwedWarning(null);
					}}
					className="gap-3"
				>
					<label
						htmlFor="stop-action-inactive"
						className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
					>
						<RadioGroupItem
							id="stop-action-inactive"
							value="inactive"
							className="mt-0.5"
						/>
						<div className="text-sm">
							<div className="font-medium">Inactive only</div>
							<p className="text-muted-foreground">
								Deactivated in iRadius and CP; history and
								username kept; can be reactivated from Stopped
								Accounts.
							</p>
						</div>
					</label>
					<label
						htmlFor="stop-action-delete"
						className="flex cursor-pointer items-start gap-3 rounded-md border border-destructive/40 p-3 has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-60"
					>
						<RadioGroupItem
							id="stop-action-delete"
							value="delete"
							className="mt-0.5"
							disabled={bridgeMissing}
						/>
						<div className="text-sm">
							<div className="font-medium text-destructive">
								Inactive + delete from iRadius and CP
							</div>
							<p className="text-muted-foreground">
								Permanently deletes the iRadius subscriber —
								frees the username, iRadius refunds unused days
								to the dealer when the plan is refundable,
								cannot be undone. The customer is hidden from CP
								lists; payment and invoice history is kept.
							</p>
							{bridgeMissing && (
								<p className="mt-1 text-destructive">
									Unavailable: the iRadius bridge is missing
									on the server.
								</p>
							)}
						</div>
					</label>
				</RadioGroup>

				{action === "delete" && (
					<p className="rounded-md bg-muted/50 p-3 text-sm">
						Current expiry:{" "}
						{expiry ? formatDate(expiry) : "not set"}
						{refundDays > 0 &&
							` — still in the future: iRadius will refund ~${refundDays} day(s) to the dealer`}
					</p>
				)}

				{owedWarning && (
					<p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
						{owedWarning}
					</p>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={reviewPayment.isPending}
					>
						Cancel
					</Button>
					<Button
						variant={
							action === "delete" ? "destructive" : "primary"
						}
						disabled={
							reviewPayment.isPending ||
							(action === "delete" && bridgeMissing)
						}
						onClick={() => submit(owedWarning !== null)}
					>
						{reviewPayment.isPending && (
							<Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
						)}
						{action === "delete"
							? owedWarning
								? "Delete anyway"
								: "Deactivate & delete"
							: "Approve & deactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
