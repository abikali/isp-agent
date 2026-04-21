"use client";

import {
	useApplyIRadiusEntitySync,
	usePreviewIRadiusEntitySync,
} from "@saas/customers/client";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
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
import { useEffect, useState } from "react";
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
	expiresAt: "Service Expiry",
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

/** Parse a phones JSON array into structured entries for display */
function parsePhones(
	json: string,
): Array<{ number: string; primary: boolean }> | null {
	try {
		const phones = JSON.parse(json) as Array<{
			number: string;
			primary: boolean;
		}>;
		if (!Array.isArray(phones) || phones.length === 0) {
			return null;
		}
		return phones;
	} catch {
		return null;
	}
}

function PhonesDisplay({
	value,
	className,
}: {
	value: string | null;
	className?: string;
}) {
	if (!value || value === "null") {
		return <span className={className}>—</span>;
	}
	const phones = parsePhones(value);
	if (!phones) {
		// Raw string (old unsplit value) — just show it
		const unwrapped =
			value.startsWith('"') && value.endsWith('"')
				? (JSON.parse(value) as string)
				: value;
		return <span className={className}>{unwrapped}</span>;
	}
	return (
		<div className={className}>
			{phones.map((p, i) => (
				<div
					key={`${p.number}-${i}`}
					className="flex items-center gap-1"
				>
					<span>{p.number}</span>
					{p.primary && (
						<Badge
							variant="outline"
							className="text-[10px] px-1 py-0"
						>
							primary
						</Badge>
					)}
				</div>
			))}
		</div>
	);
}

/** Format a serialized value for display in the diff table */
function formatValue(val: string | null): string {
	if (val == null || val === "null") {
		return "—";
	}

	// ISO dates → show date + time in local timezone
	if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
		try {
			const d = new Date(val);
			return d.toLocaleString("en-GB", {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
				timeZoneName: "short",
			});
		} catch {
			return val;
		}
	}

	// JSON-quoted strings — unwrap the outer quotes
	if (val.startsWith('"') && val.endsWith('"')) {
		try {
			return JSON.parse(val) as string;
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

// Track selected fields per entity: entityId → Set of field names
type FieldSelection = Record<string, Set<string>>;

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
	const [fieldSelection, setFieldSelection] = useState<FieldSelection>({});

	// Fetch preview when dialog opens
	const { mutate: fetchPreview } = preview;
	useEffect(() => {
		if (open && organizationId && entityIds.length > 0) {
			setFieldSelection({});
			fetchPreview({
				organizationId,
				entityType,
				entityIds,
			});
		}
	}, [open, organizationId, entityType, entityIds, fetchPreview]);

	// Initialize all fields as selected when preview data arrives
	const previews = preview.data?.previews ?? [];
	const previewsRef = preview.data?.previews;
	useEffect(() => {
		if (!previewsRef || previewsRef.length === 0) {
			return;
		}
		const initial: FieldSelection = {};
		for (const entity of previewsRef) {
			if (entity.changes.length > 0) {
				initial[entity.entityId] = new Set(
					entity.changes.map((c) => c.field),
				);
			}
		}
		setFieldSelection(initial);
	}, [previewsRef]);

	function toggleField(entityId: string, field: string) {
		setFieldSelection((prev) => {
			const entityFields = new Set(prev[entityId] ?? []);
			if (entityFields.has(field)) {
				entityFields.delete(field);
			} else {
				entityFields.add(field);
			}
			return { ...prev, [entityId]: entityFields };
		});
	}

	function toggleAllForEntity(entityId: string, allFields: string[]) {
		setFieldSelection((prev) => {
			const current = prev[entityId] ?? new Set();
			const allSelected = allFields.every((f) => current.has(f));
			return {
				...prev,
				[entityId]: allSelected
					? new Set<string>()
					: new Set(allFields),
			};
		});
	}

	function handleApply() {
		if (!organizationId) {
			return;
		}

		// Build entities payload with selected fields
		const entities: Array<{ id: string; fields: string[] }> = [];
		for (const entity of previews) {
			const selected = fieldSelection[entity.entityId];
			if (selected && selected.size > 0) {
				entities.push({
					id: entity.entityId,
					fields: Array.from(selected),
				});
			}
		}

		if (entities.length === 0) {
			return;
		}

		apply.mutate(
			{
				organizationId,
				entityType,
				entities,
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
	const notLinked = preview.data?.notLinked ?? [];
	const totalSelected = Object.values(fieldSelection).reduce(
		(sum, fields) => sum + fields.size,
		0,
	);

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
						Select which fields to sync. Only modified fields are
						shown.
					</DialogDescription>
				</DialogHeader>

				<div className="min-h-0 overflow-y-auto">
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

							{previews.map((entity) => {
								const selected =
									fieldSelection[entity.entityId] ??
									new Set<string>();
								const allFields = entity.changes.map(
									(c) => c.field,
								);
								const allSelected =
									allFields.length > 0 &&
									allFields.every((f) => selected.has(f));
								const someSelected =
									!allSelected &&
									allFields.some((f) => selected.has(f));

								return (
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
												<Badge
													variant={
														selected.size > 0
															? "default"
															: "secondary"
													}
													className="ml-auto text-xs"
												>
													{selected.size}/
													{entity.changes.length}{" "}
													selected
												</Badge>
											)}
										</div>

										{entity.changes.length > 0 && (
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="w-10 pr-0">
															<Checkbox
																checked={
																	allSelected ||
																	(someSelected &&
																		"indeterminate")
																}
																onCheckedChange={() =>
																	toggleAllForEntity(
																		entity.entityId,
																		allFields,
																	)
																}
																aria-label="Select all fields"
															/>
														</TableHead>
														<TableHead className="w-[130px]">
															Field
														</TableHead>
														<TableHead>
															Local
														</TableHead>
														<TableHead className="w-8" />
														<TableHead>
															iRadius
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{entity.changes.map(
														(change) => {
															const isChecked =
																selected.has(
																	change.field,
																);
															return (
																<TableRow
																	key={
																		change.field
																	}
																	className={
																		isChecked
																			? ""
																			: "opacity-40"
																	}
																>
																	<TableCell className="pr-0">
																		<Checkbox
																			checked={
																				isChecked
																			}
																			onCheckedChange={() =>
																				toggleField(
																					entity.entityId,
																					change.field,
																				)
																			}
																			aria-label={`Select ${change.field}`}
																		/>
																	</TableCell>
																	<TableCell className="text-xs font-medium">
																		{FIELD_LABELS[
																			change
																				.field
																		] ??
																			change.field}
																	</TableCell>
																	<TableCell className="text-xs text-muted-foreground max-w-[200px]">
																		{change.field ===
																		"phones" ? (
																			<PhonesDisplay
																				value={
																					change.local
																				}
																			/>
																		) : (
																			<span
																				className="block truncate"
																				title={
																					change.local ??
																					undefined
																				}
																			>
																				{formatValue(
																					change.local,
																				)}
																			</span>
																		)}
																	</TableCell>
																	<TableCell className="text-center">
																		<ArrowRightIcon className="size-3 text-muted-foreground" />
																	</TableCell>
																	<TableCell className="text-xs font-medium text-primary max-w-[200px]">
																		{change.field ===
																		"phones" ? (
																			<PhonesDisplay
																				value={
																					change.remote
																				}
																				className="text-primary"
																			/>
																		) : (
																			<span
																				className="block truncate"
																				title={
																					change.remote ??
																					undefined
																				}
																			>
																				{formatValue(
																					change.remote,
																				)}
																			</span>
																		)}
																	</TableCell>
																</TableRow>
															);
														},
													)}
												</TableBody>
											</Table>
										)}
									</div>
								);
							})}

							{previews.length === 0 &&
								notLinked.length === 0 && (
									<p className="py-8 text-center text-muted-foreground">
										No entities found in iRadius.
									</p>
								)}
						</div>
					)}
				</div>

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
							totalSelected === 0 ||
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
								Apply {totalSelected} field
								{totalSelected !== 1 ? "s" : ""}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
