"use client";

import {
	useApplyIRadiusEntitySync,
	usePreviewIRadiusEntitySync,
} from "@saas/customers/client";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { ScrollArea } from "@ui/components/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	ArrowRightIcon,
	CheckCircle2Icon,
	Loader2Icon,
	RefreshCwIcon,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

/** Human-readable labels for sync diff fields */
const FIELD_LABELS: Record<string, string> = {
	fullName: "Full Name",
	firstName: "First Name",
	lastName: "Last Name",
	email: "Email",
	mobile: "Mobile",
	phone: "Phone",
	phones: "Phone Numbers",
	address: "Address",
	username: "Username",
	notes: "Notes",
	planId: "Plan",
	stationId: "Station",
	accessPointId: "Access Point",
	dealerId: "Dealer",
	collectorId: "Collector",
	nasId: "NAS",
	status: "Status",
	connectionType: "Connection Type",
	ipAddress: "IP Address",
	macAddress: "MAC Address",
	monthlyRate: "Monthly Rate",
	activatedAt: "Activated At",
	expiresAt: "Expires At",
	staticIp: "Static IP",
	online: "Online",
	downloadBytes: "Download",
	uploadBytes: "Upload",
	dailyDownloadBytes: "Daily Download",
	dailyUploadBytes: "Daily Upload",
	automaticRenew: "Auto Renew",
	discount: "Discount",
	latitude: "Latitude",
	longitude: "Longitude",
	categoryName: "Category",
	groupName: "Group",
	collectorName: "Collector Name",
	collectorPhone: "Collector Phone",
	name: "Name",
	department: "Department",
	position: "Position",
	iRadiusProfile: "iRadius Profile",
	hireDate: "Hire Date",
};

function formatValue(val: string | null): string {
	if (val == null || val === "null") {
		return "—";
	}
	// Try to format dates
	if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
		try {
			return new Date(val).toLocaleDateString();
		} catch {
			return val;
		}
	}
	// Booleans
	if (val === "true") {
		return "Yes";
	}
	if (val === "false") {
		return "No";
	}
	// Large byte values: show as MB/GB
	if (/^\d{8,}$/.test(val)) {
		const bytes = Number(val);
		if (bytes > 1_073_741_824) {
			return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
		}
		if (bytes > 1_048_576) {
			return `${(bytes / 1_048_576).toFixed(1)} MB`;
		}
	}
	// Truncate long values
	if (val.length > 80) {
		return `${val.slice(0, 77)}...`;
	}
	return val;
}

interface SyncPreviewDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entityType: "customer" | "employee";
	entityIds: string[];
	onSynced?: () => void;
}

export function SyncPreviewDialog({
	open,
	onOpenChange,
	entityType,
	entityIds,
	onSynced,
}: SyncPreviewDialogProps) {
	const organizationId = useOrganizationId();
	const preview = usePreviewIRadiusEntitySync();
	const apply = useApplyIRadiusEntitySync();

	// Fetch preview when dialog opens
	const { mutate: fetchPreview } = preview;
	useEffect(() => {
		if (open && organizationId && entityIds.length > 0) {
			fetchPreview({
				organizationId,
				entityType,
				entityIds,
			});
		}
	}, [open, organizationId, entityType, entityIds, fetchPreview]);

	function handleApply() {
		if (!organizationId) {
			return;
		}
		apply.mutate(
			{
				organizationId,
				entityType,
				entityIds,
			},
			{
				onSuccess: (result) => {
					toast.success(
						`Synced ${result.synced} ${entityType}${result.synced !== 1 ? "s" : ""} from iRadius`,
					);
					if (result.errors.length > 0) {
						toast.error(
							`${result.errors.length} error${result.errors.length !== 1 ? "s" : ""} during sync`,
						);
					}
					onOpenChange(false);
					onSynced?.();
				},
				onError: (error) => {
					toast.error(`Sync failed: ${error.message}`);
				},
			},
		);
	}

	const isLoading = preview.isPending;
	const previews = preview.data?.previews ?? [];
	const notLinked = preview.data?.notLinked ?? [];
	const hasChanges = previews.some((p) => p.changes.length > 0);
	const totalChanges = previews.reduce((sum, p) => sum + p.changes.length, 0);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						Sync{" "}
						{entityType === "customer" ? "Customers" : "Employees"}{" "}
						from iRadius
					</DialogTitle>
					<DialogDescription>
						Review changes before applying. Only modified fields are
						shown.
					</DialogDescription>
				</DialogHeader>

				<ScrollArea className="max-h-[60vh]">
					{isLoading ? (
						<div className="flex items-center justify-center py-12">
							<Loader2Icon className="size-6 animate-spin text-muted-foreground" />
							<span className="ml-2 text-muted-foreground">
								Fetching from iRadius...
							</span>
						</div>
					) : preview.isError ? (
						<div className="py-8 text-center text-destructive">
							Failed to fetch preview: {preview.error.message}
						</div>
					) : (
						<div className="space-y-4">
							{notLinked.length > 0 && (
								<p className="text-sm text-muted-foreground">
									{notLinked.length}{" "}
									{entityType === "customer"
										? "customer"
										: "employee"}
									{notLinked.length !== 1 ? "s" : ""} not
									linked to iRadius (skipped).
								</p>
							)}

							{previews.map((entity) => (
								<div
									key={entity.entityId}
									className="rounded-lg border"
								>
									<div className="flex items-center gap-2 border-b px-3 py-2">
										<span className="font-medium text-sm">
											{entity.name}
										</span>
										<Badge
											variant="outline"
											className="text-xs"
										>
											iRadius #{entity.externalId}
										</Badge>
										{entity.changes.length === 0 && (
											<Badge
												variant="secondary"
												className="ml-auto text-xs"
											>
												<CheckCircle2Icon className="mr-1 size-3" />
												Up to date
											</Badge>
										)}
										{entity.changes.length > 0 && (
											<Badge className="ml-auto text-xs">
												{entity.changes.length} change
												{entity.changes.length !== 1
													? "s"
													: ""}
											</Badge>
										)}
									</div>

									{entity.changes.length > 0 && (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-[140px]">
														Field
													</TableHead>
													<TableHead>Local</TableHead>
													<TableHead className="w-8" />
													<TableHead>
														iRadius
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{entity.changes.map(
													(change) => (
														<TableRow
															key={change.field}
														>
															<TableCell className="text-xs font-medium">
																{FIELD_LABELS[
																	change.field
																] ??
																	change.field}
															</TableCell>
															<TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
																{formatValue(
																	change.local,
																)}
															</TableCell>
															<TableCell className="text-center">
																<ArrowRightIcon className="size-3 text-muted-foreground" />
															</TableCell>
															<TableCell className="text-xs font-medium text-primary max-w-[180px] truncate">
																{formatValue(
																	change.remote,
																)}
															</TableCell>
														</TableRow>
													),
												)}
											</TableBody>
										</Table>
									)}
								</div>
							))}

							{previews.length === 0 &&
								notLinked.length === 0 && (
									<p className="py-8 text-center text-muted-foreground">
										No entities found in iRadius.
									</p>
								)}
						</div>
					)}
				</ScrollArea>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={apply.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={handleApply}
						disabled={
							isLoading ||
							!hasChanges ||
							apply.isPending ||
							preview.isError
						}
					>
						{apply.isPending ? (
							<>
								<Loader2Icon className="mr-2 size-4 animate-spin" />
								Syncing...
							</>
						) : (
							<>
								<RefreshCwIcon className="mr-2 size-4" />
								Apply {totalChanges} change
								{totalChanges !== 1 ? "s" : ""}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
