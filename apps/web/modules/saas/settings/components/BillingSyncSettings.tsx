"use client";

import { useBillingSyncStatus, useTestBilling } from "@saas/billing/client";
import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { ScrollArea } from "@ui/components/scroll-area";
import {
	CheckCircle2Icon,
	CircleIcon,
	CreditCardIcon,
	LoaderIcon,
	XCircleIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { BillingSyncPreviewDialog } from "./BillingSyncPreviewDialog";

interface Counts {
	customers: number;
	payments: number;
	collections: number;
	expenses: number;
	stockItems: number;
	workerStock: number;
	installations: number;
}

export function BillingSyncSettings() {
	const organizationId = useOrganizationId();
	const testConnection = useTestBilling();
	const queryClient = useQueryClient();

	const [counts, setCounts] = useState<Counts | null>(null);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [operationId, setOperationId] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);
	const [showPreview, setShowPreview] = useState(false);

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
				description="Import billing data: enrich customer records with collector/pricing info, import payments, collections, expenses, inventory, and installations. Runs as a background job."
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
										).toLocaleString()
									: "Unknown"}
							</div>
						)}

					{!isActive && (
						<Button onClick={() => setShowPreview(true)}>
							{operationId
								? "Re-sync from Billing"
								: "Start Sync from Billing"}
						</Button>
					)}
				</div>
			</SettingsItem>

			<BillingSyncPreviewDialog
				open={showPreview}
				onOpenChange={setShowPreview}
				onSyncStarted={(id) => setOperationId(id)}
			/>
		</>
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
						{new Date(operation.completedAt).toLocaleString()}
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
				<ScrollArea className="max-h-32 rounded-md border p-3">
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
				</ScrollArea>
			)}
		</div>
	);
}
