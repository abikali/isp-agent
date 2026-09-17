"use client";

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
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { ArchiveIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useClosableEscalationsCount,
	useCloseEscalations,
} from "../hooks/use-tasks";

const DEFAULT_DAYS = "14";

export function CloseOldEscalationsDialog() {
	const organizationId = useOrganizationId();
	const closeEscalations = useCloseEscalations();
	const [open, setOpen] = useState(false);
	const [days, setDays] = useState(DEFAULT_DAYS);

	const parsedDays = Number(days);
	const validDays =
		Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 365;
	const { count: closableCount } = useClosableEscalationsCount(
		open && validDays ? parsedDays : null,
	);

	function handleOpenChange(next: boolean) {
		if (closeEscalations.isPending) {
			return;
		}
		setOpen(next);
		if (!next) {
			setDays(DEFAULT_DAYS);
		}
	}

	function handleConfirm() {
		if (!organizationId || !validDays) {
			return;
		}
		closeEscalations.mutate(
			{ organizationId, olderThanDays: parsedDays },
			{
				onSuccess: ({ count }) => {
					toast.success(
						count === 0
							? "No open escalations that old"
							: `Closed ${count} escalation${count === 1 ? "" : "s"}`,
					);
					setOpen(false);
					setDays(DEFAULT_DAYS);
				},
				onError: (error) => {
					toast.error(error.message || "Failed to close escalations");
				},
			},
		);
	}

	return (
		<AlertDialog open={open} onOpenChange={handleOpenChange}>
			<AlertDialogTrigger asChild>
				<Button variant="outline" size="sm">
					<ArchiveIcon className="size-3.5" />
					Close old…
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Close old escalations?</AlertDialogTitle>
					<AlertDialogDescription>
						Every open escalation created more than{" "}
						{validDays ? parsedDays : "N"} day
						{parsedDays === 1 ? "" : "s"} ago is marked completed,
						with a note saying you closed it. Newer escalations stay
						open.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<div className="space-y-2">
					<Label htmlFor="close-old-escalations-days">
						Older than (days)
					</Label>
					<Input
						id="close-old-escalations-days"
						type="number"
						inputMode="numeric"
						min={1}
						max={365}
						value={days}
						onChange={(e) => setDays(e.target.value)}
						className="w-32"
					/>
					{validDays && closableCount !== undefined && (
						<p className="text-muted-foreground text-sm">
							{closableCount === 0
								? "No open escalations that old."
								: `${closableCount} open escalation${closableCount === 1 ? "" : "s"} will be closed.`}
						</p>
					)}
				</div>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={closeEscalations.isPending}>
						Cancel
					</AlertDialogCancel>
					<Button
						disabled={
							!validDays ||
							closeEscalations.isPending ||
							closableCount === 0
						}
						onClick={handleConfirm}
					>
						{closeEscalations.isPending
							? "Closing…"
							: validDays && closableCount !== undefined
								? `Close ${closableCount} escalation${closableCount === 1 ? "" : "s"}`
								: "Close"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
