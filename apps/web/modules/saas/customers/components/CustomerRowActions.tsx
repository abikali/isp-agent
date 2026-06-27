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
	CalendarClockIcon,
	CheckCircle2Icon,
	CloudUploadIcon,
	CreditCardIcon,
	MapPinIcon,
	MapPinOffIcon,
	MonitorIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PercentIcon,
	UserCheckIcon,
	UserCogIcon,
	UserXIcon,
	WifiOffIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useBulkSetCustomerStatus,
	useCreateLocationRequest,
	usePushToIRadius,
} from "../hooks/use-customers";
import {
	ChangeNameDialog,
	type IradiusCustomerRef,
	ResetMacDialog,
	SetDiscountDialog,
	SetExpiryDialog,
	SetIptvPriceDialog,
} from "./CustomerIradiusDialogs";

interface CustomerRowActionsProps {
	customerId: string;
	customerName: string;
	customerStatus: string;
	hasExternalId: boolean;
	organizationSlug: string;
	organizationId: string | null;
	hasLocation: boolean;
	onRequestLocation: () => void;
	// Fields used to pre-seed the iRadius dialogs. Optional because the
	// table cell may not select all of them on every page; the dialogs
	// fall back to safe defaults when they're missing.
	customerFirstName?: string | null;
	customerLastName?: string | null;
	customerDiscount?: number | null;
	customerIptvPrice?: number | null;
	customerExpiresAt?: string | Date | null;
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
// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive row action menu wiring many tightly-coupled per-row dialogs; splitting would scatter shared state
export function CustomerRowActions({
	customerId,
	customerName,
	customerStatus,
	hasExternalId,
	organizationSlug,
	organizationId,
	hasLocation,
	onRequestLocation,
	customerFirstName,
	customerLastName,
	customerDiscount,
	customerIptvPrice,
	customerExpiresAt,
}: CustomerRowActionsProps) {
	const navigate = useNavigate();
	const createLocationRequest = useCreateLocationRequest();
	const bulkSetStatus = useBulkSetCustomerStatus();
	const pushToIRadius = usePushToIRadius();
	const [confirm, setConfirm] = useState<{
		kind: "deactivate" | "reactivate";
	} | null>(null);
	// Single state for which iRadius dialog (if any) is open on this row.
	// Mounting the dialogs unconditionally is cheap because Radix renders
	// nothing for `open={false}`; the input state inside each dialog only
	// allocates while its dialog is visible.
	const [iradiusDialog, setIradiusDialog] = useState<
		| "reset-mac"
		| "change-name"
		| "set-discount"
		| "set-iptv-price"
		| "set-expiry"
		| null
	>(null);

	const isActive = customerStatus === "ACTIVE";
	const detailPath = `/app/${organizationSlug}/customers/${customerId}`;
	const iradiusCustomer: IradiusCustomerRef = {
		id: customerId,
		externalId: hasExternalId ? "linked" : null,
		firstName: customerFirstName ?? null,
		lastName: customerLastName ?? null,
		discount: customerDiscount ?? null,
		iptvPrice: customerIptvPrice ?? null,
		expiresAt: customerExpiresAt ?? null,
	};

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
					{hasExternalId && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-xs text-muted-foreground">
								iRadius
							</DropdownMenuLabel>
							<DropdownMenuItem
								disabled={
									pushToIRadius.isPending || !organizationId
								}
								onClick={() => {
									if (!organizationId) {
										return;
									}
									pushToIRadius.mutate(
										{
											organizationId,
											customerId,
										},
										{
											onSuccess: () =>
												toast.success(
													`${customerName} pushed to iRadius`,
												),
											onError: (err) =>
												toast.error(err.message),
										},
									);
								}}
							>
								<CloudUploadIcon className="mr-2 size-4" />
								Push to iRadius
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIradiusDialog("reset-mac")}
							>
								<WifiOffIcon className="mr-2 size-4" />
								Reset MAC address
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIradiusDialog("change-name")}
							>
								<UserCogIcon className="mr-2 size-4" />
								Change name
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIradiusDialog("set-discount")}
							>
								<PercentIcon className="mr-2 size-4" />
								Set recurring discount
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									setIradiusDialog("set-iptv-price")
								}
							>
								<MonitorIcon className="mr-2 size-4" />
								Set IPTV price
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setIradiusDialog("set-expiry")}
							>
								<CalendarClockIcon className="mr-2 size-4" />
								Set billing expiry date
							</DropdownMenuItem>
						</>
					)}
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

			{/*
			 * Per-row iRadius dialogs. Only mounted when this row has an
			 * `externalId` AND we know the org context, since both are
			 * preconditions for the mutations underneath. The dialog
			 * components self-manage their input state; we just pass the
			 * current `iradiusCustomer` snapshot so they seed correctly.
			 */}
			{hasExternalId && organizationId && (
				<>
					<ResetMacDialog
						open={iradiusDialog === "reset-mac"}
						onOpenChange={(o) =>
							setIradiusDialog(o ? "reset-mac" : null)
						}
						organizationId={organizationId}
						customer={iradiusCustomer}
					/>
					<ChangeNameDialog
						open={iradiusDialog === "change-name"}
						onOpenChange={(o) =>
							setIradiusDialog(o ? "change-name" : null)
						}
						organizationId={organizationId}
						customer={iradiusCustomer}
					/>
					<SetDiscountDialog
						open={iradiusDialog === "set-discount"}
						onOpenChange={(o) =>
							setIradiusDialog(o ? "set-discount" : null)
						}
						organizationId={organizationId}
						customer={iradiusCustomer}
					/>
					<SetIptvPriceDialog
						open={iradiusDialog === "set-iptv-price"}
						onOpenChange={(o) =>
							setIradiusDialog(o ? "set-iptv-price" : null)
						}
						organizationId={organizationId}
						customer={iradiusCustomer}
					/>
					<SetExpiryDialog
						open={iradiusDialog === "set-expiry"}
						onOpenChange={(o) =>
							setIradiusDialog(o ? "set-expiry" : null)
						}
						organizationId={organizationId}
						customer={iradiusCustomer}
					/>
				</>
			)}

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
