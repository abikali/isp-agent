"use client";

import {
	usePreviewBillingSync,
	useSyncFromBilling,
} from "@saas/billing/client";
import { useOrganizationId } from "@shared/lib/organization";
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
import { Input } from "@ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	CheckCircle2Icon,
	CheckIcon,
	ChevronDownIcon,
	LoaderIcon,
	PlayIcon,
	PlusIcon,
	SkipForwardIcon,
	UserPlusIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface UnmatchedEmployee {
	username: string;
	role: string;
	phone: string | null;
}

interface ExistingEmployee {
	id: string;
	name: string;
	username: string | null;
	department: string | null;
}

type Action = "create" | "skip" | string; // string = employeeId for mapping

interface BillingSyncPreviewDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSyncStarted: (operationId: string) => void;
}

export function BillingSyncPreviewDialog({
	open,
	onOpenChange,
	onSyncStarted,
}: BillingSyncPreviewDialogProps) {
	const organizationId = useOrganizationId();
	const preview = usePreviewBillingSync();
	const startSync = useSyncFromBilling();

	const [unmatched, setUnmatched] = useState<UnmatchedEmployee[]>([]);
	const [existing, setExisting] = useState<ExistingEmployee[]>([]);
	const [actions, setActions] = useState<Map<string, Action>>(new Map());
	const [error, setError] = useState<string | null>(null);
	const fetchedRef = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: preview.mutate triggers state changes — fetchedRef guards against re-execution
	useEffect(() => {
		if (!open) {
			fetchedRef.current = false;
			setUnmatched([]);
			setExisting([]);
			setActions(new Map());
			setError(null);
			return;
		}

		if (!organizationId || fetchedRef.current) {
			return;
		}

		fetchedRef.current = true;
		setError(null);
		preview.mutate(
			{ organizationId },
			{
				onSuccess: (data) => {
					setUnmatched(data.unmatchedEmployees);
					setExisting(data.existingEmployees);
					// Prefill from saved mappings, fallback to "create"
					const defaults = new Map<string, Action>();
					const savedMap = new Map(
						data.savedMappings.map((m) => [m.billingUsername, m]),
					);
					for (const emp of data.unmatchedEmployees) {
						const saved = savedMap.get(emp.username);
						if (saved?.action === "map" && saved.employeeId) {
							defaults.set(emp.username, saved.employeeId);
						} else if (saved?.action === "skip") {
							defaults.set(emp.username, "skip");
						} else {
							defaults.set(emp.username, "create");
						}
					}
					setActions(defaults);
				},
				onError: (err) => {
					setError(err.message);
				},
			},
		);
	}, [open, organizationId]);

	function setAction(username: string, action: Action) {
		setActions((prev) => {
			const next = new Map(prev);
			next.set(username, action);
			return next;
		});
	}

	function setAllActions(action: Action) {
		setActions((prev) => {
			const next = new Map(prev);
			for (const emp of unmatched) {
				next.set(emp.username, action);
			}
			return next;
		});
	}

	async function handleConfirmSync() {
		if (!organizationId) {
			return;
		}

		const createEmployees: Array<{
			username: string;
			role: string;
			phone: string | null;
		}> = [];
		const mapEmployees: Array<{
			billingUsername: string;
			employeeId: string;
		}> = [];
		const skippedEmployees: string[] = [];

		for (const emp of unmatched) {
			const action = actions.get(emp.username) ?? "skip";
			if (action === "create") {
				createEmployees.push({
					username: emp.username,
					role: emp.role,
					phone: emp.phone,
				});
			} else if (action === "skip") {
				skippedEmployees.push(emp.username);
			} else {
				mapEmployees.push({
					billingUsername: emp.username,
					employeeId: action,
				});
			}
		}

		try {
			const result = await startSync.mutateAsync({
				organizationId,
				createEmployees,
				mapEmployees,
				skippedEmployees,
			});
			onSyncStarted(result.operationId);
			onOpenChange(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to start sync",
			);
		}
	}

	const createCount = [...actions.values()].filter(
		(a) => a === "create",
	).length;
	const mapCount = [...actions.values()].filter(
		(a) => a !== "create" && a !== "skip",
	).length;
	const skipCount = [...actions.values()].filter((a) => a === "skip").length;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>Billing Sync Preview</DialogTitle>
				</DialogHeader>

				{/* Loading */}
				{preview.isPending && (
					<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
						<LoaderIcon className="size-4 animate-spin" />
						Analyzing billing system...
					</div>
				)}

				{/* Error */}
				{error && (
					<Alert variant="error">
						<AlertTitle>Preview failed</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{/* Results */}
				{!preview.isPending && !error && (
					<div className="min-h-0 flex-1 space-y-3">
						{unmatched.length === 0 ? (
							<div className="flex items-center gap-2 rounded-lg border p-4 text-sm">
								<CheckCircle2Icon className="size-4 text-green-600" />
								All billing employees already exist in the
								system. Ready to sync.
							</div>
						) : (
							<>
								<div className="flex items-center justify-between">
									<p className="flex items-center gap-2 text-sm text-muted-foreground">
										<UserPlusIcon className="size-4" />
										{unmatched.length} unmatched employee
										{unmatched.length !== 1 ? "s" : ""}
									</p>
									<div className="flex gap-1">
										<Button
											size="sm"
											variant="ghost"
											className="text-xs"
											onClick={() =>
												setAllActions("create")
											}
										>
											All: Create
										</Button>
										<Button
											size="sm"
											variant="ghost"
											className="text-xs"
											onClick={() =>
												setAllActions("skip")
											}
										>
											All: Skip
										</Button>
									</div>
								</div>

								<div className="max-h-64 overflow-y-auto rounded-lg border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Username</TableHead>
												<TableHead>Role</TableHead>
												<TableHead>Phone</TableHead>
												<TableHead className="w-48">
													Action
												</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{unmatched.map((emp) => (
												<TableRow key={emp.username}>
													<TableCell className="font-medium text-sm">
														{emp.username}
													</TableCell>
													<TableCell>
														<Badge
															variant="outline"
															className="text-xs capitalize"
														>
															{emp.role}
														</Badge>
													</TableCell>
													<TableCell className="text-xs text-muted-foreground">
														{emp.phone ?? "—"}
													</TableCell>
													<TableCell>
														<ActionPicker
															value={
																actions.get(
																	emp.username,
																) ?? "create"
															}
															onChange={(v) =>
																setAction(
																	emp.username,
																	v,
																)
															}
															employees={existing}
														/>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								{/* Summary */}
								<div className="flex gap-3 text-xs text-muted-foreground">
									{createCount > 0 && (
										<span className="text-green-600">
											{createCount} to create
										</span>
									)}
									{mapCount > 0 && (
										<span className="text-blue-600">
											{mapCount} to map
										</span>
									)}
									{skipCount > 0 && (
										<span>{skipCount} skipped</span>
									)}
								</div>
							</>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						onClick={handleConfirmSync}
						disabled={
							preview.isPending || !!error || startSync.isPending
						}
					>
						<PlayIcon className="mr-2 size-4" />
						{startSync.isPending ? "Starting..." : "Confirm & Sync"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Searchable action picker ───────────────────────────────────

function ActionPicker({
	value,
	onChange,
	employees,
}: {
	value: Action;
	onChange: (action: Action) => void;
	employees: ExistingEmployee[];
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const filtered = search
		? employees.filter(
				(e) =>
					e.name.toLowerCase().includes(search.toLowerCase()) ||
					(e.username?.toLowerCase().includes(search.toLowerCase()) ??
						false),
			)
		: employees;

	function getLabel(): string {
		if (value === "create") {
			return "Create new";
		}
		if (value === "skip") {
			return "Skip";
		}
		const emp = employees.find((e) => e.id === value);
		return emp ? `Map to ${emp.name}` : "Select...";
	}

	function select(action: Action) {
		onChange(action);
		setOpen(false);
		setSearch("");
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 w-full justify-between text-xs font-normal"
				>
					<span className="truncate">{getLabel()}</span>
					<ChevronDownIcon className="ml-1 size-3 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-64 p-0"
				align="end"
				side="bottom"
				collisionPadding={8}
				avoidCollisions
			>
				{/* Fixed actions */}
				<div className="border-b p-1">
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
						onClick={() => select("create")}
					>
						<PlusIcon className="size-3" />
						Create new
						{value === "create" && (
							<CheckIcon className="ml-auto size-3 text-primary" />
						)}
					</button>
					<button
						type="button"
						className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
						onClick={() => select("skip")}
					>
						<SkipForwardIcon className="size-3" />
						Skip
						{value === "skip" && (
							<CheckIcon className="ml-auto size-3 text-primary" />
						)}
					</button>
				</div>

				{/* Search + employee list */}
				{employees.length > 0 && (
					<div>
						<div className="p-2">
							<Input
								placeholder="Search employees..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="h-7 text-xs"
							/>
						</div>
						<div
							className="max-h-48 overflow-y-auto overscroll-contain px-1 pb-1"
							onWheel={(e) => e.stopPropagation()}
						>
							{filtered.length === 0 ? (
								<p className="px-2 py-1.5 text-xs text-muted-foreground">
									No match
								</p>
							) : (
								filtered.map((emp) => (
									<button
										key={emp.id}
										type="button"
										className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent"
										onClick={() => select(emp.id)}
									>
										<span className="truncate">
											{emp.name}
											{emp.username && (
												<span className="ml-1 text-muted-foreground">
													({emp.username})
												</span>
											)}
										</span>
										{value === emp.id && (
											<CheckIcon className="ml-auto size-3 shrink-0 text-primary" />
										)}
									</button>
								))
							)}
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
