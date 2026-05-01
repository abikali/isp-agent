"use client";

import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { formatDateTime } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@ui/components/alert";
import { Button } from "@ui/components/button";
import { ScrollArea } from "@ui/components/scroll-area";
import {
	CheckCircle2Icon,
	CircleIcon,
	DatabaseIcon,
	LoaderIcon,
	TriangleAlertIcon,
	UploadCloudIcon,
	XCircleIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import {
	useCancelIRadiusPush,
	useCancelIRadiusSync,
	useIRadiusPushStatus,
	useIRadiusSyncStatus,
	useStartIRadiusPush,
	useSyncConflictsSummary,
	useSyncFromIRadius,
	useTestIRadius,
} from "../../customers/hooks/use-customers";
import { SyncConflictsDialog } from "./SyncConflictsDialog";

interface Counts {
	subscribers: number;
	employees: number;
	accountTypes: number;
	stations: number;
	accessPoints: number;
	balances: number;
	invoices: number;
}

export function IRadiusSyncSettings() {
	const organizationId = useOrganizationId();
	const { data: iradiusStatus } = useQuery(
		organizationId
			? orpc.organizations.getIradiusStatus.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["organizations", "getIradiusStatus"]),
	);

	if (iradiusStatus?.iradiusDisabled) {
		return (
			<Alert variant="default">
				<TriangleAlertIcon className="size-4" />
				<AlertTitle>
					iRadius is disabled for this organization
				</AlertTitle>
				<AlertDescription>
					This organization opted out of the legacy iRadius
					integration. Customers, plans, employees, and payments are
					managed locally — no data flows to or from iRadius.
				</AlertDescription>
			</Alert>
		);
	}

	return <IRadiusSyncSettingsInner />;
}

function IRadiusSyncSettingsInner() {
	const organizationId = useOrganizationId();
	const testConnection = useTestIRadius();
	const syncIRadius = useSyncFromIRadius();
	const cancelSync = useCancelIRadiusSync();
	const queryClient = useQueryClient();
	const { data: conflictSummary } = useSyncConflictsSummary(organizationId);

	const [counts, setCounts] = useState<Counts | null>(null);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [operationId, setOperationId] = useState<string | null>(null);
	const [connected, setConnected] = useState(false);

	// Track whether we already invalidated for this operation
	const invalidatedRef = useRef<string | null>(null);

	// Single query: fetches latest operation on mount, polls specific operation when active
	const { data: statusData } = useIRadiusSyncStatus(
		organizationId,
		operationId,
	);
	const operation = statusData?.operation ?? null;

	const isActive =
		operation?.status === "pending" || operation?.status === "in_progress";
	const isComplete = operation?.status === "completed";
	const isFailed = operation?.status === "failed";

	// Invalidate customer cache once when sync completes (no useEffect needed)
	if (
		(isComplete || isFailed) &&
		operation?.id &&
		invalidatedRef.current !== operation.id
	) {
		invalidatedRef.current = operation.id;
		queryClient.invalidateQueries({
			queryKey: orpc.customers.key(),
		});
	}

	async function handleTestConnection() {
		if (!organizationId) {
			return;
		}
		setConnectionError(null);
		try {
			const result = await testConnection.mutateAsync({
				organizationId,
			});
			if (result.connected && result.counts) {
				setCounts(result.counts);
				setConnected(true);
			} else {
				setConnectionError(
					result.error ?? "Failed to connect to iRadius database",
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

	async function handleSync() {
		if (!organizationId) {
			return;
		}
		setConnectionError(null);
		try {
			const result = await syncIRadius.mutateAsync({
				organizationId,
			});
			setOperationId(result.operationId);
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
				title="iRadius Database"
				description="Connect to the legacy iRadius ISP management system to sync all customer data, service plans, stations, access points, financial records, and network infrastructure."
			>
				<div className="space-y-4">
					{connected && counts ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<DatabaseIcon className="size-4 text-green-600" />
								<span className="text-sm font-medium">
									Connected
								</span>
							</div>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								<CountBadge
									label="Subscribers"
									count={counts.subscribers}
								/>
								<CountBadge
									label="Employees"
									count={counts.employees}
								/>
								<CountBadge
									label="Plans"
									count={counts.accountTypes}
								/>
								<CountBadge
									label="Stations"
									count={counts.stations}
								/>
								<CountBadge
									label="APs"
									count={counts.accessPoints}
								/>
								<CountBadge
									label="Transactions"
									count={counts.balances}
								/>
								<CountBadge
									label="Invoices"
									count={counts.invoices}
								/>
							</div>
						</div>
					) : (
						<Button
							onClick={handleTestConnection}
							disabled={testConnection.isPending}
							variant="outline"
						>
							<DatabaseIcon className="mr-2 size-4" />
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
				description="Import all data from iRadius. This runs as a background job — you can close this page and come back to check progress."
				fullWidth
			>
				<div className="space-y-4">
					{/* Active sync progress */}
					{isActive && operation && (
						<>
							<SyncProgress operation={operation as Operation} />
							<Button
								variant="destructive"
								size="sm"
								onClick={() => {
									if (organizationId) {
										cancelSync.mutate({ organizationId });
										setOperationId(null);
									}
								}}
								disabled={cancelSync.isPending}
							>
								{cancelSync.isPending
									? "Cancelling..."
									: "Cancel Sync"}
							</Button>
						</>
					)}

					{/* Completed sync result */}
					{(isComplete || isFailed) && operation && (
						<SyncResult operation={operation as Operation} />
					)}

					{/* Conflict notification */}
					{isComplete &&
						operation &&
						(operation.totalConflicts ?? 0) > 0 && (
							<Alert>
								<TriangleAlertIcon className="size-4" />
								<AlertTitle>
									{operation.totalConflicts} field conflict
									{operation.totalConflicts !== 1 ? "s" : ""}{" "}
									require your review
								</AlertTitle>
								<AlertDescription>
									Some customer fields differ between iRadius
									and your local data. Review and choose which
									values to keep.
									<div className="mt-2">
										<SyncConflictsDialog
											organizationId={
												organizationId ?? ""
											}
										/>
									</div>
								</AlertDescription>
							</Alert>
						)}

					{/* Last sync info (when no active sync and no user-triggered operation) */}
					{!isActive &&
						operation?.status === "completed" &&
						!operationId && (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<CheckCircle2Icon className="size-4 text-green-600" />
								Last synced:{" "}
								{operation.completedAt
									? formatDateTime(operation.completedAt)
									: "Unknown"}
							</div>
						)}

					{/* Persistent conflicts indicator (from any previous sync) */}
					{!isActive &&
						(conflictSummary?.pendingCount ?? 0) > 0 &&
						!(
							isComplete &&
							operation &&
							(operation.totalConflicts ?? 0) > 0
						) && (
							<Alert>
								<TriangleAlertIcon className="size-4" />
								<AlertTitle>
									{conflictSummary?.pendingCount} unresolved
									conflict
									{conflictSummary?.pendingCount !== 1
										? "s"
										: ""}{" "}
									from a previous sync
								</AlertTitle>
								<AlertDescription>
									<div className="mt-2">
										<SyncConflictsDialog
											organizationId={
												organizationId ?? ""
											}
										/>
									</div>
								</AlertDescription>
							</Alert>
						)}

					{/* Start sync button */}
					{!isActive && (
						<Button
							onClick={handleSync}
							disabled={syncIRadius.isPending}
						>
							{syncIRadius.isPending
								? "Starting..."
								: operationId
									? "Re-sync from iRadius"
									: "Start Sync from iRadius"}
						</Button>
					)}
				</div>
			</SettingsItem>

			<IRadiusPushSettingsItem />
		</>
	);
}

// ---------------------------------------------------------------------------
// Push (local → iRadius) section — mirror of the sync-from flow above
// ---------------------------------------------------------------------------

function IRadiusPushSettingsItem() {
	const organizationId = useOrganizationId();
	const startPush = useStartIRadiusPush();
	const cancelPush = useCancelIRadiusPush();

	const [pushOperationId, setPushOperationId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const { data: statusData } = useIRadiusPushStatus(
		organizationId,
		pushOperationId,
	);
	const operation = statusData?.operation ?? null;

	const isActive =
		operation?.status === "pending" || operation?.status === "in_progress";
	const isComplete = operation?.status === "completed";
	const isFailed = operation?.status === "failed";

	async function handleStart() {
		if (!organizationId) {
			return;
		}
		setError(null);
		try {
			const result = await startPush.mutateAsync({ organizationId });
			setPushOperationId(result.operationId);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to start push",
			);
		}
	}

	return (
		<SettingsItem
			title="Data Sync to iRadius"
			description="Push the locally-authoritative customer fields (names, email, phones, address, location, notes) back to iRadius. Runs as a background job — you can close this page and come back."
			fullWidth
		>
			<div className="space-y-4">
				{isActive && operation && (
					<>
						<PushProgress operation={operation as PushOperation} />
						<Button
							variant="destructive"
							size="sm"
							onClick={() => {
								if (organizationId) {
									cancelPush.mutate({ organizationId });
									setPushOperationId(null);
								}
							}}
							disabled={cancelPush.isPending}
						>
							{cancelPush.isPending
								? "Cancelling..."
								: "Cancel Push"}
						</Button>
					</>
				)}

				{(isComplete || isFailed) && operation && (
					<PushResult operation={operation as PushOperation} />
				)}

				{!isActive &&
					operation?.status === "completed" &&
					!pushOperationId && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<CheckCircle2Icon className="size-4 text-green-600" />
							Last pushed:{" "}
							{operation.completedAt
								? formatDateTime(operation.completedAt)
								: "Unknown"}
						</div>
					)}

				{error && (
					<Alert variant="error">
						<XCircleIcon />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{!isActive && (
					<Button
						onClick={handleStart}
						disabled={startPush.isPending}
					>
						<UploadCloudIcon className="mr-2 size-4" />
						{startPush.isPending
							? "Starting..."
							: pushOperationId
								? "Re-push to iRadius"
								: "Start Push to iRadius"}
					</Button>
				)}
			</div>
		</SettingsItem>
	);
}

interface PushOperation {
	id: string;
	status: string;
	phase: string | null;
	totalCustomers: number;
	processedCustomers: number;
	pushedCustomers: number;
	skippedCustomers: number;
	failedCustomers: number;
	// biome-ignore lint/suspicious/noExplicitAny: Prisma JsonValue
	result: any;
	completedAt: Date | string | null;
}

function PushProgress({ operation }: { operation: PushOperation }) {
	const total = operation.totalCustomers;
	const processed = operation.processedCustomers;
	const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

	return (
		<div className="space-y-3 rounded-lg border border-border p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<LoaderIcon className="size-4 animate-spin text-primary" />
				Push in progress...
			</div>
			<div className="space-y-1">
				<div className="flex items-center justify-between text-sm">
					<div className="flex items-center gap-2">
						<LoaderIcon className="size-4 animate-spin text-primary" />
						<span>Customers</span>
					</div>
					{total > 0 && (
						<span className="font-mono text-xs text-muted-foreground">
							{processed.toLocaleString()} /{" "}
							{total.toLocaleString()}
						</span>
					)}
				</div>
				{total > 0 && (
					<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all duration-300"
							style={{ width: `${pct}%` }}
						/>
					</div>
				)}
			</div>
			<div className="flex gap-3 text-xs text-muted-foreground">
				<span>{operation.pushedCustomers.toLocaleString()} pushed</span>
				<span>
					{operation.skippedCustomers.toLocaleString()} skipped
					(unlinked)
				</span>
				{operation.failedCustomers > 0 && (
					<span className="text-destructive">
						{operation.failedCustomers.toLocaleString()} failed
					</span>
				)}
			</div>
		</div>
	);
}

function PushResult({ operation }: { operation: PushOperation }) {
	const isFailed = operation.status === "failed";
	const errors =
		(operation.result?.errors as Array<{
			phase: string;
			detail: string;
		}>) ?? [];

	return (
		<div className="space-y-3">
			<Alert variant={isFailed ? "error" : "success"}>
				{isFailed ? <XCircleIcon /> : <CheckCircle2Icon />}
				<AlertTitle>
					{isFailed
						? "Push failed"
						: operation.failedCustomers > 0
							? "Push completed with errors"
							: "Push successful"}
				</AlertTitle>
				{operation.completedAt && (
					<AlertDescription>
						Completed at {formatDateTime(operation.completedAt)}
					</AlertDescription>
				)}
			</Alert>

			<div className="space-y-1 text-sm">
				<div className="flex items-center gap-2">
					<CheckCircle2Icon className="size-3 text-green-600" />
					<span className="font-medium">Pushed:</span>
					<span>
						{operation.pushedCustomers.toLocaleString()} customers
					</span>
				</div>
				{operation.skippedCustomers > 0 && (
					<div className="flex items-center gap-2">
						<CircleIcon className="size-3 text-muted-foreground" />
						<span className="font-medium">Skipped:</span>
						<span>
							{operation.skippedCustomers.toLocaleString()} (no
							iRadius link)
						</span>
					</div>
				)}
				{operation.failedCustomers > 0 && (
					<div className="flex items-center gap-2">
						<XCircleIcon className="size-3 text-destructive" />
						<span className="font-medium">Failed:</span>
						<span>
							{operation.failedCustomers.toLocaleString()}
						</span>
					</div>
				)}
			</div>

			{errors.length > 0 && (
				<ScrollArea className="max-h-32 rounded-md border p-3">
					<ul className="space-y-1 text-xs text-destructive">
						{errors.slice(0, 50).map((err, i) => (
							<li key={`push-err-${i}`}>
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

interface Operation {
	id: string;
	status: string;
	phase: string | null;
	totalPlans: number;
	processedPlans: number;
	totalStations: number;
	processedStations: number;
	totalAccessPoints: number;
	processedAccessPoints: number;
	totalNas: number;
	processedNas: number;
	totalRouters: number;
	processedRouters: number;
	totalEmployees: number;
	processedEmployees: number;
	totalCustomers: number;
	processedCustomers: number;
	totalConflicts: number;
	resolvedConflicts: number;
	// biome-ignore lint/suspicious/noExplicitAny: Prisma JsonValue
	result: any;
	completedAt: Date | string | null;
}

const PHASES = [
	{
		key: "plans",
		label: "Service Plans",
		totalKey: "totalPlans",
		processedKey: "processedPlans",
	},
	{
		key: "stations",
		label: "Stations",
		totalKey: "totalStations",
		processedKey: "processedStations",
	},
	{
		key: "accessPoints",
		label: "Access Points",
		totalKey: "totalAccessPoints",
		processedKey: "processedAccessPoints",
	},
	{
		key: "nas",
		label: "NAS Servers",
		totalKey: "totalNas",
		processedKey: "processedNas",
	},
	{
		key: "routers",
		label: "Routers",
		totalKey: "totalRouters",
		processedKey: "processedRouters",
	},
	{
		key: "employees",
		label: "Employees",
		totalKey: "totalEmployees",
		processedKey: "processedEmployees",
	},
	{
		key: "customers",
		label: "Customers",
		totalKey: "totalCustomers",
		processedKey: "processedCustomers",
	},
] as const;

function getPhaseStatus(
	op: Operation,
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

function SyncProgress({ operation }: { operation: Operation }) {
	return (
		<div className="space-y-3 rounded-lg border border-border p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<LoaderIcon className="size-4 animate-spin text-primary" />
				Sync in progress...
			</div>
			<div className="space-y-2">
				{PHASES.map((phase) => {
					const total = operation[
						phase.totalKey as keyof Operation
					] as number;
					const processed = operation[
						phase.processedKey as keyof Operation
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

function SyncResult({ operation }: { operation: Operation }) {
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
						Completed at {formatDateTime(operation.completedAt)}
					</AlertDescription>
				)}
			</Alert>

			<div className="space-y-1 text-sm">
				{PHASES.map((phase) => {
					const total = operation[
						phase.totalKey as keyof Operation
					] as number;
					const processed = operation[
						phase.processedKey as keyof Operation
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
