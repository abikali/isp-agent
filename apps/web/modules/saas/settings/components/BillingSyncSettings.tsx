"use client";

import {
	useBillingSyncStatus,
	usePreviewBillingSync,
	useSyncFromBilling,
	useTestBilling,
} from "@saas/billing/client";
import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ChevronRightIcon,
	CircleIcon,
	CreditCardIcon,
	LoaderIcon,
	XCircleIcon,
} from "lucide-react";
import { useRef, useState } from "react";

interface Counts {
	customers: number;
	payments: number;
	collections: number;
	expenses: number;
	stockItems: number;
	workerStock: number;
	installations: number;
}

interface UnmatchedCustomer {
	username: string;
	dealer: string | null;
}

interface PhasePreview {
	total: number;
	matched: number;
	skipped: number;
	reason: string;
	unmatchedCustomers: UnmatchedCustomer[];
	unmatchedEmployees: string[];
}

interface UnmatchedEmployee {
	username: string;
	role: string | null;
	phone: string | null;
	telegram: string | null;
}

interface PreviewData {
	phases: {
		customers: PhasePreview;
		payments: PhasePreview;
		collections: PhasePreview;
		expenses: PhasePreview;
		installations: PhasePreview;
	};
	unmatchedEmployees: UnmatchedEmployee[];
	unmatchedCustomers: UnmatchedCustomer[];
}

export function BillingSyncSettings() {
	const organizationId = useOrganizationId();
	const testConnection = useTestBilling();
	const previewSync = usePreviewBillingSync();
	const syncFromBilling = useSyncFromBilling();
	const queryClient = useQueryClient();

	const [counts, setCounts] = useState<Counts | null>(null);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [operationId, setOperationId] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);
	const [preview, setPreview] = useState<PreviewData | null>(null);

	const invalidatedRef = useRef<string | null>(null);

	const { data: statusData } = useBillingSyncStatus(
		organizationId,
		operationId,
	);
	const operation = statusData?.operation ?? null;

	const isActive =
		operation?.status === "pending" || operation?.status === "in_progress";
	const isComplete = operation?.status === "completed";
	const isFailed = operation?.status === "failed";

	// Invalidate caches once when sync completes
	if (
		(isComplete || isFailed) &&
		operation?.id &&
		invalidatedRef.current !== operation.id
	) {
		invalidatedRef.current = operation.id;
		queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
		queryClient.invalidateQueries({ queryKey: orpc.customers.key() });
	}

	async function handleTestConnection() {
		if (!organizationId) {
			return;
		}
		setConnectionError(null);
		try {
			const result = await testConnection.mutateAsync({ organizationId });
			if (result.connected && result.counts) {
				setCounts(result.counts);
				setConnected(true);
			} else {
				setConnectionError(
					result.error ?? "Failed to connect to billing database",
				);
			}
		} catch (error) {
			setConnectionError(
				error instanceof Error
					? error.message
					: "Connection test failed",
			);
		}
	}

	async function handlePreview() {
		if (!organizationId) {
			return;
		}
		setConnectionError(null);
		try {
			const result = await previewSync.mutateAsync({ organizationId });
			setPreview(result as PreviewData);
		} catch (error) {
			setConnectionError(
				error instanceof Error ? error.message : "Preview failed",
			);
		}
	}

	const [showMappingModal, setShowMappingModal] = useState(false);
	const [pendingMappings, setPendingMappings] = useState<
		Record<
			string,
			{
				action: "skip" | "create" | "map";
				targetEmployeeId?: string;
				createName?: string;
				role?: string;
				phone?: string;
				telegram?: string;
			}
		>
	>({});

	async function handleStartSync() {
		if (!organizationId) {
			return;
		}

		// Auto-run preview if we don't have one yet
		let currentPreview = preview;
		if (!currentPreview) {
			try {
				currentPreview = (await previewSync.mutateAsync({
					organizationId,
				})) as PreviewData;
				setPreview(currentPreview);
			} catch (error) {
				setConnectionError(
					error instanceof Error ? error.message : "Preview failed",
				);
				return;
			}
		}

		// If there are unmatched employees, show the mapping modal
		if (currentPreview.unmatchedEmployees.length > 0 && !showMappingModal) {
			const initial: typeof pendingMappings = {};
			for (const emp of currentPreview.unmatchedEmployees) {
				initial[emp.username] = {
					action: "skip",
					role: emp.role ?? undefined,
					phone: emp.phone ?? undefined,
					telegram: emp.telegram ?? undefined,
				};
			}
			setPendingMappings(initial);
			setShowMappingModal(true);
			return;
		}

		startSync(pendingMappings);
	}

	async function startSync(
		mappings?: Record<
			string,
			{
				action: "skip" | "create" | "map";
				targetEmployeeId?: string;
				createName?: string;
				role?: string;
				phone?: string;
				telegram?: string;
			}
		>,
	) {
		if (!organizationId) {
			return;
		}
		try {
			const hasNonSkipMappings =
				mappings &&
				Object.values(mappings).some((m) => m.action !== "skip");
			const result = await syncFromBilling.mutateAsync({
				organizationId,
				employeeMappings: hasNonSkipMappings ? mappings : undefined,
			});
			setOperationId(result.operationId);
			setPreview(null);
			setShowMappingModal(false);
		} catch (error) {
			setConnectionError(
				error instanceof Error ? error.message : "Failed to start sync",
			);
		}
	}

	return (
		<>
			{/* Connection Test */}
			<SettingsItem
				title="Billing System"
				description="Connect to the billing system (billing.libancomlb.com) to sync payment records, cash collections, expenses, inventory, and installations."
			>
				<div className="space-y-4">
					{connected && counts ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<CreditCardIcon className="size-4 text-green-600" />
								<span className="text-sm font-medium">
									Connected
								</span>
							</div>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								<CountBadge
									label="Customers"
									count={counts.customers}
								/>
								<CountBadge
									label="Payments"
									count={counts.payments}
								/>
								<CountBadge
									label="Collections"
									count={counts.collections}
								/>
								<CountBadge
									label="Expenses"
									count={counts.expenses}
								/>
								<CountBadge
									label="Stock Items"
									count={counts.stockItems}
								/>
								<CountBadge
									label="Worker Stock"
									count={counts.workerStock}
								/>
								<CountBadge
									label="Installations"
									count={counts.installations}
								/>
							</div>
						</div>
					) : (
						<Button
							onClick={handleTestConnection}
							disabled={testConnection.isPending}
							variant="outline"
						>
							<CreditCardIcon className="mr-2 size-4" />
							{testConnection.isPending
								? "Connecting..."
								: "Test Connection"}
						</Button>
					)}

					{connectionError && (
						<Alert variant="error">
							<XCircleIcon />
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>
								{connectionError}
							</AlertDescription>
						</Alert>
					)}
				</div>
			</SettingsItem>

			{/* Sync Control + Progress */}
			<SettingsItem
				title="Data Sync"
				description="Import billing data: enrich customer records with pricing info, import payments, collections, expenses, inventory, and installations. Runs as a background job."
				fullWidth
			>
				<div className="space-y-4">
					{isActive && operation && (
						<SyncProgress
							operation={operation as BillingOperation}
						/>
					)}

					{(isComplete || isFailed) && operation && (
						<SyncResult operation={operation as BillingOperation} />
					)}

					{!isActive &&
						operation?.status === "completed" &&
						!operationId && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<CheckCircle2Icon className="size-4 text-green-600" />
								Last synced:{" "}
								{operation.completedAt
									? new Date(
											operation.completedAt,
										).toLocaleString("en-GB")
									: "Unknown"}
							</div>
						)}

					{preview && <SyncPreview preview={preview} />}

					{!isActive && (
						<div className="flex gap-2">
							<Button
								onClick={handlePreview}
								variant="outline"
								disabled={previewSync.isPending}
							>
								{previewSync.isPending
									? "Checking..."
									: "Preview Sync"}
							</Button>
							<Button
								onClick={handleStartSync}
								disabled={syncFromBilling.isPending}
							>
								{syncFromBilling.isPending
									? "Starting..."
									: operationId
										? "Re-sync from Billing"
										: "Start Sync"}
							</Button>
						</div>
					)}
				</div>
			</SettingsItem>

			{/* Employee Mapping Modal */}
			<EmployeeMappingModal
				open={showMappingModal}
				onOpenChange={setShowMappingModal}
				unmatchedEmployees={preview?.unmatchedEmployees ?? []}
				mappings={pendingMappings}
				onMappingsChange={setPendingMappings}
				onConfirm={() => startSync(pendingMappings)}
				isSubmitting={syncFromBilling.isPending}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Employee Mapping Modal
// ---------------------------------------------------------------------------

interface MappingEntry {
	action: "skip" | "create" | "map";
	targetEmployeeId?: string;
	createName?: string;
}

const ROLE_LABELS: Record<string, string> = {
	worker: "Field Worker",
	collector: "Collector",
	followup: "Follow-up",
	accounting: "Accounting",
	dealer: "Dealer",
	admin: "Admin",
};

function EmployeeMappingModal({
	open,
	onOpenChange,
	unmatchedEmployees,
	mappings,
	onMappingsChange,
	onConfirm,
	isSubmitting,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	unmatchedEmployees: UnmatchedEmployee[];
	mappings: Record<string, MappingEntry>;
	onMappingsChange: (m: Record<string, MappingEntry>) => void;
	onConfirm: () => void;
	isSubmitting: boolean;
}) {
	const organizationId = useOrganizationId();
	const { data: employeesData } = useQuery(
		organizationId
			? orpc.employees.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["employees", "list"]),
	);
	const allEmployees = employeesData?.employees ?? [];

	function updateMapping(name: string, partial: Partial<MappingEntry>) {
		const current = mappings[name] ?? { action: "skip" as const };
		onMappingsChange({ ...mappings, [name]: { ...current, ...partial } });
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Resolve Unmatched Employees</DialogTitle>
					<p className="text-sm text-muted-foreground">
						{unmatchedEmployees.length} employee name
						{unmatchedEmployees.length !== 1 ? "s" : ""} from the
						billing system could not be matched. Choose how to
						handle each one.
					</p>
				</DialogHeader>

				<div className="space-y-3">
					{unmatchedEmployees.map((emp) => {
						const mapping = mappings[emp.username] ?? {
							action: "skip",
						};
						return (
							<div
								key={emp.username}
								className="rounded-lg border p-3 space-y-2"
							>
								<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="font-mono text-sm font-medium truncate">
												{emp.username}
											</p>
											{emp.role && (
												<Badge
													variant="secondary"
													className="text-xs shrink-0"
												>
													{ROLE_LABELS[emp.role] ??
														emp.role}
												</Badge>
											)}
										</div>
										{emp.phone && (
											<p className="text-xs text-muted-foreground mt-0.5">
												{emp.phone}
											</p>
										)}
									</div>
									<Select
										value={mapping.action}
										onValueChange={(
											val: "skip" | "create" | "map",
										) => {
											updateMapping(emp.username, {
												action: val,
												createName:
													val === "create"
														? emp.username
														: undefined,
												targetEmployeeId: undefined,
											});
										}}
									>
										<SelectTrigger className="w-full sm:w-32">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="skip">
												Skip
											</SelectItem>
											<SelectItem value="create">
												Create New
											</SelectItem>
											<SelectItem value="map">
												Map To...
											</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{mapping.action === "map" && (
									<Select
										value={mapping.targetEmployeeId ?? ""}
										onValueChange={(val) => {
											updateMapping(emp.username, {
												targetEmployeeId: val,
											});
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select existing employee..." />
										</SelectTrigger>
										<SelectContent>
											{allEmployees.map((e) => (
												<SelectItem
													key={e.id}
													value={e.id}
												>
													{e.name}
													{e.department
														? ` — ${e.department}`
														: ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								)}
							</div>
						);
					})}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button onClick={onConfirm} disabled={isSubmitting}>
						{isSubmitting ? "Starting..." : "Start Sync"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
	customers: "Customers",
	payments: "Payments",
	collections: "Collections",
	expenses: "Expenses",
	installations: "Installations",
};

function SyncPreview({ preview }: { preview: PreviewData }) {
	const phases = Object.entries(preview.phases) as Array<
		[string, PhasePreview]
	>;
	const totalSkipped = phases.reduce((sum, [, p]) => sum + p.skipped, 0);
	const [expanded, setExpanded] = useState<string | null>(null);

	return (
		<div className="space-y-4 rounded-lg border border-border p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				{totalSkipped > 0 ? (
					<AlertTriangleIcon className="size-4 text-amber-500" />
				) : (
					<CheckCircle2Icon className="size-4 text-green-600" />
				)}
				{totalSkipped > 0
					? `${totalSkipped.toLocaleString()} records will be skipped due to missing mappings`
					: "All records can be imported"}
			</div>

			<div className="space-y-1">
				{phases.map(([key, phase]) => {
					const hasDetails =
						phase.skipped > 0 &&
						(phase.unmatchedEmployees.length > 0 ||
							phase.unmatchedCustomers.length > 0);
					const isExpanded = expanded === key;

					return (
						<div key={key}>
							<button
								type="button"
								className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
									hasDetails
										? "cursor-pointer hover:bg-muted/50"
										: "cursor-default"
								}`}
								onClick={() => {
									if (hasDetails) {
										setExpanded(isExpanded ? null : key);
									}
								}}
							>
								<div className="flex items-center gap-2">
									{hasDetails && (
										<ChevronRightIcon
											className={`size-3.5 text-muted-foreground transition-transform ${
												isExpanded ? "rotate-90" : ""
											}`}
										/>
									)}
									<span>{PHASE_LABELS[key] ?? key}</span>
								</div>
								<div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
									<Badge
										variant="secondary"
										className="text-xs"
									>
										{phase.matched.toLocaleString()} matched
									</Badge>
									{phase.skipped > 0 && (
										<Badge
											variant="destructive"
											className="text-xs"
										>
											{phase.skipped.toLocaleString()}{" "}
											skipped
										</Badge>
									)}
								</div>
							</button>

							{isExpanded && (
								<div className="ml-6 mt-1 mb-2 space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
									<p className="text-muted-foreground">
										{phase.reason}
									</p>
									{phase.unmatchedEmployees.length > 0 && (
										<div className="space-y-1">
											<p className="font-medium text-destructive">
												Missing employees (
												{
													phase.unmatchedEmployees
														.length
												}
												):
											</p>
											<div className="flex flex-wrap gap-1">
												{phase.unmatchedEmployees.map(
													(name) => (
														<Badge
															key={name}
															variant="outline"
															className="text-xs"
														>
															{name}
														</Badge>
													),
												)}
											</div>
										</div>
									)}
									{phase.unmatchedCustomers.length > 0 && (
										<UnmatchedCustomersList
											customers={phase.unmatchedCustomers}
										/>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function UnmatchedCustomersList({
	customers,
}: {
	customers: UnmatchedCustomer[];
}) {
	// Group by dealer
	const byDealer = new Map<string, string[]>();
	for (const c of customers) {
		const dealer = c.dealer ?? "Unknown";
		const list = byDealer.get(dealer);
		if (list) {
			list.push(c.username);
		} else {
			byDealer.set(dealer, [c.username]);
		}
	}
	const dealers = [...byDealer.entries()].sort((a, b) =>
		a[0].localeCompare(b[0]),
	);

	return (
		<div className="space-y-1">
			<p className="font-medium text-destructive">
				Missing customers ({customers.length}):
			</p>
			<div className="thin-scrollbar max-h-40 space-y-2 overflow-y-auto">
				{dealers.map(([dealer, usernames]) => (
					<div key={dealer}>
						<p className="text-muted-foreground">
							<span className="font-medium text-foreground">
								{dealer}
							</span>{" "}
							({usernames.length})
						</p>
						<div className="mt-0.5 flex flex-wrap gap-1">
							{usernames.map((name) => (
								<Badge
									key={name}
									variant="outline"
									className="text-xs"
								>
									{name}
								</Badge>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CountBadge({ label, count }: { label: string; count: number }) {
	return (
		<div className="rounded-md border px-2 py-1 text-center">
			<p className="font-mono text-sm font-bold">
				{count.toLocaleString()}
			</p>
			<p className="text-xs text-muted-foreground">{label}</p>
		</div>
	);
}

interface BillingOperation {
	id: string;
	status: string;
	phase: string | null;
	totalCustomers: number;
	processedCustomers: number;
	totalPayments: number;
	processedPayments: number;
	totalCollections: number;
	processedCollections: number;
	totalExpenses: number;
	processedExpenses: number;
	totalStockItems: number;
	processedStockItems: number;
	totalWorkerStock: number;
	processedWorkerStock: number;
	totalInstallations: number;
	processedInstallations: number;
	totalReconciled: number;
	processedReconciled: number;
	// biome-ignore lint/suspicious/noExplicitAny: Prisma JsonValue
	result: any;
	completedAt: Date | string | null;
}

const PHASES = [
	{
		key: "customers",
		label: "Customer Enrichment",
		totalKey: "totalCustomers",
		processedKey: "processedCustomers",
	},
	{
		key: "payments",
		label: "Payments",
		totalKey: "totalPayments",
		processedKey: "processedPayments",
	},
	{
		key: "collections",
		label: "Cash Collections",
		totalKey: "totalCollections",
		processedKey: "processedCollections",
	},
	{
		key: "expenses",
		label: "Expenses",
		totalKey: "totalExpenses",
		processedKey: "processedExpenses",
	},
	{
		key: "stockItems",
		label: "Stock Items",
		totalKey: "totalStockItems",
		processedKey: "processedStockItems",
	},
	{
		key: "workerStock",
		label: "Worker Stock",
		totalKey: "totalWorkerStock",
		processedKey: "processedWorkerStock",
	},
	{
		key: "installations",
		label: "Installations",
		totalKey: "totalInstallations",
		processedKey: "processedInstallations",
	},
	{
		key: "reconciliation",
		label: "Reconciliation",
		totalKey: "totalReconciled",
		processedKey: "processedReconciled",
	},
] as const;

function getPhaseStatus(
	op: BillingOperation,
	phaseKey: string,
	total: number,
	processed: number,
): "pending" | "active" | "done" {
	if (processed > 0 && processed >= total && total > 0) {
		return "done";
	}
	if (op.phase === phaseKey) {
		return "active";
	}
	const currentIdx = PHASES.findIndex((p) => p.key === op.phase);
	const thisIdx = PHASES.findIndex((p) => p.key === phaseKey);
	if (currentIdx > thisIdx && total > 0) {
		return "done";
	}
	return "pending";
}

function SyncProgress({ operation }: { operation: BillingOperation }) {
	return (
		<div className="space-y-3 rounded-lg border border-border p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<LoaderIcon className="size-4 animate-spin text-primary" />
				Billing sync in progress...
			</div>
			<div className="space-y-2">
				{PHASES.map((phase) => {
					const total = operation[
						phase.totalKey as keyof BillingOperation
					] as number;
					const processed = operation[
						phase.processedKey as keyof BillingOperation
					] as number;
					const status = getPhaseStatus(
						operation,
						phase.key,
						total,
						processed,
					);
					const pct =
						total > 0 ? Math.round((processed / total) * 100) : 0;

					return (
						<div key={phase.key} className="space-y-1">
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									{status === "done" && (
										<CheckCircle2Icon className="size-4 text-green-600" />
									)}
									{status === "active" && (
										<LoaderIcon className="size-4 animate-spin text-primary" />
									)}
									{status === "pending" && (
										<CircleIcon className="size-4 text-muted-foreground" />
									)}
									<span
										className={
											status === "pending"
												? "text-muted-foreground"
												: ""
										}
									>
										{phase.label}
									</span>
								</div>
								{total > 0 && (
									<span className="font-mono text-xs text-muted-foreground">
										{processed.toLocaleString()} /{" "}
										{total.toLocaleString()}
									</span>
								)}
							</div>
							{status === "active" && total > 0 && (
								<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-primary transition-all duration-300"
										style={{ width: `${pct}%` }}
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function SyncResult({ operation }: { operation: BillingOperation }) {
	const isFailed = operation.status === "failed";
	const errors =
		(operation.result?.["errors"] as Array<{
			phase: string;
			detail: string;
		}>) ?? [];

	return (
		<div className="space-y-3">
			<Alert variant={isFailed ? "error" : "success"}>
				{isFailed ? <XCircleIcon /> : <CheckCircle2Icon />}
				<AlertTitle>
					{isFailed
						? "Sync failed"
						: errors.length > 0
							? "Sync completed with errors"
							: "Sync successful"}
				</AlertTitle>
				{operation.completedAt && (
					<AlertDescription>
						Completed at{" "}
						{new Date(operation.completedAt).toLocaleString(
							"en-GB",
						)}
					</AlertDescription>
				)}
			</Alert>

			<div className="space-y-1 text-sm">
				{PHASES.map((phase) => {
					const total = operation[
						phase.totalKey as keyof BillingOperation
					] as number;
					const processed = operation[
						phase.processedKey as keyof BillingOperation
					] as number;
					if (total === 0 && processed === 0) {
						return null;
					}
					return (
						<div
							key={phase.key}
							className="flex items-center gap-2"
						>
							<CheckCircle2Icon className="size-3 text-green-600" />
							<span className="font-medium">{phase.label}:</span>
							<span>{processed.toLocaleString()} processed</span>
						</div>
					);
				})}
			</div>

			{errors.length > 0 && (
				<div className="thin-scrollbar max-h-32 overflow-y-auto rounded-md border p-3">
					<ul className="space-y-1 text-xs text-destructive">
						{errors.slice(0, 50).map((err, i) => (
							<li key={`err-${err.phase}-${i}`}>
								<span className="font-medium">
									[{err.phase}]{" "}
								</span>
								{err.detail}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
