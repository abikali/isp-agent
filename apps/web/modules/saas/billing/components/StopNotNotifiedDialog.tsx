"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/components/alert-dialog";
import { Button } from "@ui/components/button";
import { toast } from "sonner";
import { useSendStopNotice } from "../hooks/use-customer-notifications";

export interface StopNotNotifiedTarget {
	organizationId: string;
	paymentId: string;
	customerName: string;
	approve: () => void;
}

/**
 * Approving a pending stop whose customer was never notified: a reminder,
 * not a block ("ahsan ma ensa"). [Notify] sends the notice instead of
 * approving, so the customer gets a chance to answer first.
 */
export function StopNotNotifiedDialog({
	target,
	onClose,
}: {
	target: StopNotNotifiedTarget | null;
	onClose: () => void;
}) {
	const notify = useSendStopNotice();

	return (
		<AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Customer was not notified
					</AlertDialogTitle>
					<AlertDialogDescription>
						{target?.customerName || "This customer"} has not been
						sent the stop notice (WhatsApp + SMS with the
						collector's number). Notify them first and give them a
						chance to answer?
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						variant="outline"
						disabled={!target || notify.isPending}
						onClick={() => {
							if (!target) {
								return;
							}
							notify.mutate(
								{
									organizationId: target.organizationId,
									paymentId: target.paymentId,
								},
								{
									onSuccess: () => {
										toast.success("Notification queued");
										onClose();
									},
									onError: (error) =>
										toast.error(error.message),
								},
							);
						}}
					>
						Notify
					</Button>
					<AlertDialogAction
						onClick={() => {
							target?.approve();
							onClose();
						}}
					>
						Approve anyway
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
