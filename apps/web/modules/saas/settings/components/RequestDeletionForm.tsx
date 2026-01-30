"use client";

import { SettingsItem } from "@saas/shared/client";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Button } from "@ui/components/button";
import { Textarea } from "@ui/components/textarea";
import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function RequestDeletionForm() {
	const queryClient = useQueryClient();
	const [reason, setReason] = useState("");
	const [dialogOpen, setDialogOpen] = useState(false);

	const { data: deletionStatus, isLoading } = useQuery(
		orpc.users.deletionStatus.queryOptions({
			input: {},
		}),
	);

	const requestDeletionMutation = useMutation(
		orpc.users.requestDeletion.mutationOptions(),
	);
	const cancelDeletionMutation = useMutation(
		orpc.users.cancelDeletion.mutationOptions(),
	);

	const handleRequestDeletion = async () => {
		try {
			await requestDeletionMutation.mutateAsync({
				reason: reason || undefined,
			});
			queryClient.invalidateQueries({
				queryKey: orpc.users.deletionStatus.key(),
			});
			setDialogOpen(false);
			setReason("");
			toast.success("Account deletion requested successfully");
		} catch {
			toast.error("Failed to request account deletion");
		}
	};

	const handleCancelDeletion = async () => {
		try {
			await cancelDeletionMutation.mutateAsync({});
			queryClient.invalidateQueries({
				queryKey: orpc.users.deletionStatus.key(),
			});
			toast.success("Account deletion cancelled successfully");
		} catch {
			toast.error("Failed to cancel account deletion");
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString(undefined, {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	if (isLoading) {
		return (
			<SettingsItem
				title="Request Account Deletion"
				description="Request permanent deletion of your account and all data"
			>
				<div className="py-4 text-center text-muted-foreground">
					Loading...
				</div>
			</SettingsItem>
		);
	}

	// Account is scheduled for deletion
	if (
		deletionStatus?.isScheduledForDeletion &&
		deletionStatus.deletionScheduledFor
	) {
		return (
			<SettingsItem
				title="Account Deletion Scheduled"
				description={`Your account is scheduled for deletion on ${formatDate(deletionStatus.deletionScheduledFor)}`}
			>
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
					<div className="flex items-start gap-3">
						<AlertTriangleIcon className="size-5 text-destructive" />
						<div className="flex-1">
							<p className="text-sm text-destructive">
								Your account will be permanently deleted on{" "}
								<strong>
									{formatDate(
										deletionStatus.deletionScheduledFor,
									)}
								</strong>
								.
							</p>
							{deletionStatus.reason && (
								<p className="mt-1 text-sm text-muted-foreground">
									Reason: {deletionStatus.reason}
								</p>
							)}
						</div>
					</div>
				</div>
				<div className="mt-4 flex justify-end">
					<Button
						variant="outline"
						onClick={handleCancelDeletion}
						disabled={cancelDeletionMutation.isPending}
						loading={cancelDeletionMutation.isPending}
					>
						Cancel Deletion Request
					</Button>
				</div>
			</SettingsItem>
		);
	}

	// Normal state - can request deletion
	return (
		<SettingsItem
			title="Request Account Deletion"
			description="Request permanent deletion of your account and all data"
		>
			<div className="flex justify-end">
				<AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							Request Account Deletion
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Confirm Account Deletion
							</AlertDialogTitle>
							<AlertDialogDescription>
								This will schedule your account for permanent
								deletion. You will have 30 days to cancel this
								request.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="py-4">
							<label
								htmlFor="deletion-reason"
								className="text-sm font-medium"
							>
								Reason for deletion (optional)
							</label>
							<Textarea
								id="deletion-reason"
								className="mt-2"
								placeholder="Help us improve by telling us why you're leaving..."
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={3}
							/>
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={handleRequestDeletion}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{requestDeletionMutation.isPending
									? "Processing..."
									: "Request Deletion"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</SettingsItem>
	);
}
