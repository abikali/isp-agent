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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Separator } from "@ui/components/separator";
import {
	CalendarClockIcon,
	MapPinIcon,
	MonitorIcon,
	MoreHorizontalIcon,
	PercentIcon,
	RefreshCwIcon,
	UserCheckIcon,
	UserCogIcon,
	UserXIcon,
	WifiOffIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useBulkSetCustomerStatus } from "../hooks/use-customers";
import {
	BulkChangeCollectorDialog,
	BulkResetMacDialog,
	BulkSetDiscountDialog,
	BulkSetExpiryDialog,
	BulkSetIptvPriceDialog,
} from "./BulkIradiusDialogs";

interface CustomerBulkActionsBarProps {
	count: number;
	customerIds: string[];
	organizationId: string;
	collectors: Array<{ id: string; name: string }>;
	onCleared: () => void;
	// Optional integrations the host page already owns dialogs for.
	// When omitted, the matching button is hidden so the bar adapts to
	// surfaces that don't expose those flows (e.g. payments table).
	onSyncFromIRadius?: () => void;
	onRequestLocation?: () => void;
	syncFromIRadiusDisabled?: boolean;
	requestLocationDisabled?: boolean;
	// Per-row context label, e.g. "customer selected" or "payment selected".
	// Defaults to "customer selected" / "customers selected".
	rowLabelSingular?: string;
	rowLabelPlural?: string;
	// Extra context-specific actions rendered before the Clear button
	// (e.g. "Void unpaid" on the Unpaid Customers page).
	extraActions?: ReactNode;
}

/**
 * Selection toolbar shared by every customer-scoped table — the customers
 * list, the payments table, and the unpaid-customers table. Hosts manage
 * their own row selection state and pass the resolved `customerIds` (the
 * payments table deduplicates by mapping selected payments back to their
 * customer). The bar then provides every customer-level action that
 * makes sense in bulk:
 *
 *   - Activate / Deactivate          (status flip + iRadius mirror)
 *   - Sync from iRadius              (opt-in; host opens its own dialog)
 *   - Request location               (opt-in; host opens its own dialog)
 *   - Reset MAC / Set discount / Set IPTV price / Set expiry  (More menu)
 *   - Change collector               (More menu)
 *   - <extraActions>                 (host-specific, e.g. Void unpaid)
 *   - Clear
 *
 * The Activate/Deactivate flow stays inline as the most common action
 * pair; everything iRadius-y is folded into the "More" dropdown to keep
 * the toolbar scannable. Dialog state for the iRadius bulk actions and
 * the Activate/Deactivate confirms is owned here so each host doesn't
 * need to re-wire 7 dialogs.
 */
export function CustomerBulkActionsBar({
	count,
	customerIds,
	organizationId,
	collectors,
	onCleared,
	onSyncFromIRadius,
	onRequestLocation,
	syncFromIRadiusDisabled,
	requestLocationDisabled,
	rowLabelSingular = "customer selected",
	rowLabelPlural = "customers selected",
	extraActions,
}: CustomerBulkActionsBarProps) {
	const bulkSetStatus = useBulkSetCustomerStatus();
	const [confirmBulkStatus, setConfirmBulkStatus] = useState<
		"ACTIVE" | "INACTIVE" | null
	>(null);
	const [bulkDialog, setBulkDialog] = useState<
		| "reset-mac"
		| "set-discount"
		| "set-iptv-price"
		| "set-expiry"
		| "change-collector"
		| null
	>(null);

	function doBulkSetStatus(target: "ACTIVE" | "INACTIVE") {
		if (customerIds.length === 0) {
			return;
		}
		bulkSetStatus.mutate(
			{ organizationId, customerIds, status: target },
			{
				onSuccess: (result) => {
					const verb =
						target === "ACTIVE" ? "Activated" : "Deactivated";
					const parts: string[] = [`${verb} ${result.succeeded}`];
					if (result.skipped > 0) {
						parts.push(`${result.skipped} already in target state`);
					}
					if (result.failed > 0) {
						parts.push(`${result.failed} failed`);
					}
					const summary = parts.join(" · ");
					if (result.failed > 0) {
						toast.warning(summary);
					} else {
						toast.success(summary);
					}
					setConfirmBulkStatus(null);
					onCleared();
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 shadow-card">
				<div className="flex items-center gap-2 text-sm">
					<span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
						{count}
					</span>
					<span className="font-medium">
						{count === 1 ? rowLabelSingular : rowLabelPlural}
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={bulkSetStatus.isPending}
						onClick={() => setConfirmBulkStatus("ACTIVE")}
					>
						<UserCheckIcon className="mr-2 size-4" />
						Activate
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={bulkSetStatus.isPending}
						onClick={() => setConfirmBulkStatus("INACTIVE")}
						className="text-destructive hover:text-destructive"
					>
						<UserXIcon className="mr-2 size-4" />
						Deactivate
					</Button>
					{(onSyncFromIRadius || onRequestLocation) && (
						<Separator
							orientation="vertical"
							className="h-6 bg-primary/20"
						/>
					)}
					{onSyncFromIRadius && (
						<Button
							size="sm"
							variant="outline"
							disabled={syncFromIRadiusDisabled}
							onClick={onSyncFromIRadius}
						>
							<RefreshCwIcon className="mr-2 size-4" />
							Sync from iRadius
						</Button>
					)}
					{onRequestLocation && (
						<Button
							size="sm"
							variant="outline"
							disabled={requestLocationDisabled}
							onClick={onRequestLocation}
						>
							<MapPinIcon className="mr-2 size-4" />
							Request location
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm" variant="outline">
								<MoreHorizontalIcon className="mr-2 size-4" />
								More
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel className="text-xs text-muted-foreground">
								iRadius
							</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() => setBulkDialog("reset-mac")}
							>
								<WifiOffIcon className="mr-2 size-4" />
								Reset MAC address
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setBulkDialog("set-discount")}
							>
								<PercentIcon className="mr-2 size-4" />
								Set recurring discount
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setBulkDialog("set-iptv-price")}
							>
								<MonitorIcon className="mr-2 size-4" />
								Set IPTV price
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => setBulkDialog("set-expiry")}
							>
								<CalendarClockIcon className="mr-2 size-4" />
								Set billing expiry date
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuLabel className="text-xs text-muted-foreground">
								Assignment
							</DropdownMenuLabel>
							<DropdownMenuItem
								onClick={() =>
									setBulkDialog("change-collector")
								}
							>
								<UserCogIcon className="mr-2 size-4" />
								Change collector
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					{extraActions}
					<Separator
						orientation="vertical"
						className="h-6 bg-primary/20"
					/>
					<Button
						size="sm"
						variant="ghost"
						onClick={onCleared}
						className="text-muted-foreground"
					>
						Clear
					</Button>
				</div>
			</div>

			{/* Activate / deactivate confirmation — same shell, two copies. */}
			<AlertDialog
				open={confirmBulkStatus !== null}
				onOpenChange={(o) => {
					if (!o) {
						setConfirmBulkStatus(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{confirmBulkStatus === "ACTIVE"
								? `Reactivate ${count} customer${count === 1 ? "" : "s"}?`
								: `Deactivate ${count} customer${count === 1 ? "" : "s"}?`}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmBulkStatus === "ACTIVE"
								? "Each selected customer will be set to ACTIVE in iRadius and locally. Customers already active are skipped."
								: "Each selected customer will be set to INACTIVE in iRadius (disconnecting active sessions) and locally. Customers already inactive are skipped. You can reactivate any of them later."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (confirmBulkStatus) {
									doBulkSetStatus(confirmBulkStatus);
								}
							}}
							disabled={bulkSetStatus.isPending}
						>
							{bulkSetStatus.isPending
								? "Working…"
								: confirmBulkStatus === "ACTIVE"
									? "Activate all"
									: "Deactivate all"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* iRadius bulk dialogs. Mounted once here; the bar's host
			    doesn't need to know they exist. */}
			<BulkResetMacDialog
				open={bulkDialog === "reset-mac"}
				onOpenChange={(o) => setBulkDialog(o ? "reset-mac" : null)}
				organizationId={organizationId}
				customerIds={customerIds}
				onCompleted={onCleared}
			/>
			<BulkSetDiscountDialog
				open={bulkDialog === "set-discount"}
				onOpenChange={(o) => setBulkDialog(o ? "set-discount" : null)}
				organizationId={organizationId}
				customerIds={customerIds}
				onCompleted={onCleared}
			/>
			<BulkSetIptvPriceDialog
				open={bulkDialog === "set-iptv-price"}
				onOpenChange={(o) => setBulkDialog(o ? "set-iptv-price" : null)}
				organizationId={organizationId}
				customerIds={customerIds}
				onCompleted={onCleared}
			/>
			<BulkSetExpiryDialog
				open={bulkDialog === "set-expiry"}
				onOpenChange={(o) => setBulkDialog(o ? "set-expiry" : null)}
				organizationId={organizationId}
				customerIds={customerIds}
				onCompleted={onCleared}
			/>
			<BulkChangeCollectorDialog
				open={bulkDialog === "change-collector"}
				onOpenChange={(o) =>
					setBulkDialog(o ? "change-collector" : null)
				}
				organizationId={organizationId}
				customerIds={customerIds}
				collectors={collectors}
				onCompleted={onCleared}
			/>
		</>
	);
}
