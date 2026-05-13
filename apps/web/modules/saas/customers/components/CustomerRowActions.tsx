"use client";

import { useNavigate } from "@tanstack/react-router";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import {
	ActivityIcon,
	CheckCircle2Icon,
	CreditCardIcon,
	MapPinIcon,
	MapPinOffIcon,
	MoreHorizontalIcon,
	PencilIcon,
	UserCheckIcon,
	UserXIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useBulkSetCustomerStatus,
	useCreateLocationRequest,
} from "../hooks/use-customers";

interface CustomerRowActionsProps {
	customerId: string;
	customerName: string;
	customerStatus: string;
	hasExternalId: boolean;
	organizationSlug: string;
	organizationId: string | null;
	hasLocation: boolean;
	onRequestLocation: () => void;
}

/**
 * Per-row action cell for the customers table. The default surface is
 * compact (an Edit link plus a "Request location" affordance when the
 * customer has no coords) and an overflow `…` dropdown collects the rest
 * of the row-scoped actions — view detail, payments, deactivate /
 * reactivate. Deactivate/reactivate share the bulk-set-status endpoint
 * with selection N=1 so the iRadius mirror + audit log behave the same
 * as the detail-page flows.
 *
 * Subscribes to the mutation hooks locally so a pending flip re-renders
 * only this one cell, not the entire `columns` useMemo on the parent.
 */
export function CustomerRowActions({
	customerId,
	customerName,
	customerStatus,
	hasExternalId,
	organizationSlug,
	organizationId,
	hasLocation,
	onRequestLocation,
}: CustomerRowActionsProps) {
	const navigate = useNavigate();
	const createLocationRequest = useCreateLocationRequest();
	const bulkSetStatus = useBulkSetCustomerStatus();
	const [confirm, setConfirm] = useState<{
		kind: "deactivate" | "reactivate";
	} | null>(null);

	const isActive = customerStatus === "ACTIVE";
	const detailPath = `/app/${organizationSlug}/customers/${customerId}`;

	function go(to: string) {
		void navigate({ to });
	}

	function runStatusChange(target: "ACTIVE" | "INACTIVE") {
		if (!organizationId) {
			return;
		}
		bulkSetStatus.mutate(
			{
				organizationId,
				customerIds: [customerId],
				status: target,
			},
			{
				onSuccess: (result) => {
					if (result.succeeded > 0) {
						toast.success(
							target === "ACTIVE"
								? `${customerName} reactivated`
								: `${customerName} deactivated`,
						);
					} else if (result.skipped > 0) {
						toast.info(
							target === "ACTIVE"
								? "Already active"
								: "Already inactive",
						);
					} else if (result.failed > 0) {
						const reason = result.failures[0]?.reason ?? "Unknown";
						toast.error(`Status change failed: ${reason}`);
					}
				},
				onError: (error) => {
					toast.error(
						error instanceof Error
							? error.message
							: "Status change failed",
					);
				},
			},
		);
	}

	return (
		<div className="flex items-center justify-end gap-0.5">
			{!hasLocation && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							disabled={createLocationRequest.isPending}
							onClick={(e) => {
								e.stopPropagation();
								onRequestLocation();
							}}
						>
							<MapPinOffIcon className="size-4 text-amber-600" />
							<span className="sr-only">Request location</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent>Request location</TooltipContent>
				</Tooltip>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={(e) => {
							e.stopPropagation();
							go(detailPath);
						}}
					>
						<PencilIcon className="size-4" />
						<span className="sr-only">Edit</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent>Edit customer</TooltipContent>
			</Tooltip>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={(e) => e.stopPropagation()}
						aria-label="More actions"
					>
						<MoreHorizontalIcon className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="w-52"
					onClick={(e) => e.stopPropagation()}
				>
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						{customerName}
					</DropdownMenuLabel>
					<DropdownMenuItem onClick={() => go(detailPath)}>
						<PencilIcon className="mr-2 size-4" />
						Open customer
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => go(`${detailPath}?tab=activity`)}
					>
						<ActivityIcon className="mr-2 size-4" />
						View activity
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => go(`${detailPath}?tab=payments`)}
					>
						<CreditCardIcon className="mr-2 size-4" />
						View payments
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => onRequestLocation()}
						disabled={createLocationRequest.isPending}
					>
						<MapPinIcon className="mr-2 size-4" />
						{hasLocation
							? "Re-request location"
							: "Request location"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{isActive ? (
						<DropdownMenuItem
							onClick={() => setConfirm({ kind: "deactivate" })}
							disabled={bulkSetStatus.isPending || !hasExternalId}
							className="text-destructive focus:text-destructive"
						>
							<UserXIcon className="mr-2 size-4" />
							Deactivate
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							onClick={() => setConfirm({ kind: "reactivate" })}
							disabled={bulkSetStatus.isPending || !hasExternalId}
						>
							<UserCheckIcon className="mr-2 size-4" />
							Reactivate
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog
				open={confirm !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConfirm(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirm?.kind === "deactivate"
								? "Deactivate customer?"
								: "Reactivate customer?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirm?.kind === "deactivate"
								? `This sets ${customerName} to inactive and disconnects them in iRadius. You can reactivate later.`
								: `This sets ${customerName} back to active and re-enables their iRadius connection.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								const target =
									confirm?.kind === "deactivate"
										? "INACTIVE"
										: "ACTIVE";
								setConfirm(null);
								runStatusChange(target);
							}}
						>
							{confirm?.kind === "deactivate" ? (
								<>
									<UserXIcon className="mr-2 size-4" />
									Deactivate
								</>
							) : (
								<>
									<CheckCircle2Icon className="mr-2 size-4" />
									Reactivate
								</>
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
