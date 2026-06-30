"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { Pagination } from "@saas/shared/components/Pagination";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import {
	BoxIcon,
	CheckIcon,
	ImageIcon,
	PuzzleIcon,
	RadioTowerIcon,
	WarehouseIcon,
	WrenchIcon,
	XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type InstallationStatus,
	useApproveInstallations,
	useDenyInstallation,
	useInstallations,
	useUpdatePendingInstallation,
} from "../hooks/use-installations";

type Installation = ReturnType<
	typeof useInstallations
>["installations"][number];

const STATUS_BADGES: Record<
	InstallationStatus,
	{ label: string; variant: "info" | "success" | "error" | "outline" }
> = {
	PENDING: { label: "Pending", variant: "info" },
	APPROVED: { label: "Approved", variant: "success" },
	COMPLETED: { label: "Completed", variant: "success" },
	DENIED: { label: "Denied", variant: "error" },
};

function installationName(inst: Installation): string {
	return inst.stockItem?.name ?? inst.notes ?? "—";
}

function TypeIcon({ inst }: { inst: Installation }) {
	if (inst.isAddOn) {
		return <PuzzleIcon className="size-4 text-purple-500" />;
	}
	if (inst.stationId) {
		return <RadioTowerIcon className="size-4 text-blue-500" />;
	}
	if (inst.baseId) {
		return <WarehouseIcon className="size-4 text-amber-500" />;
	}
	return <BoxIcon className="size-4 text-muted-foreground" />;
}

function installationKind(inst: Installation): string {
	if (inst.isAddOn) {
		return "Add-on";
	}
	if (inst.stationId) {
		return "Station";
	}
	if (inst.baseId) {
		return "Base";
	}
	return "Item";
}

/**
 * Leading visual for a row: the completion photo (clickable) when one was
 * recorded by closing a field task, otherwise a typed placeholder tile.
 */
function MediaThumb({
	inst,
	onView,
}: {
	inst: Installation;
	onView: (photo: { src: string; title: string }) => void;
}) {
	const photoUrl = inst.task?.completionPhotoUrl ?? null;
	if (photoUrl) {
		return (
			<button
				type="button"
				onClick={() =>
					onView({ src: photoUrl, title: installationName(inst) })
				}
				className="group relative size-11 shrink-0 overflow-hidden rounded-md border bg-muted"
				aria-label="View completion photo"
			>
				<img
					src={photoUrl}
					alt={installationName(inst)}
					loading="lazy"
					className="size-full object-cover transition-transform group-hover:scale-105"
				/>
				<span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
					<ImageIcon className="size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" />
				</span>
			</button>
		);
	}
	return (
		<div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40">
			<TypeIcon inst={inst} />
		</div>
	);
}

/** Local edit state for inline price/qty on pending rows. */
interface RowEdit {
	price: string;
	quantity: string;
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive installations review page: filters, inline row edits, and table column defs share local state; splitting would scatter tightly-coupled state
export function InstallationsList({
	organizationSlug,
}: {
	organizationSlug: string;
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/inline-edit state slices read clearer as separate useState than a reducer
}) {
	const organizationId = useOrganizationId();
	const [tab, setTab] = useState<"pending" | "history">("pending");
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [employeeId, setEmployeeId] = useState<string | undefined>();
	const [typeFilter, setTypeFilter] = useState<
		"item" | "station" | "base" | "addon" | undefined
	>();
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [priceMin, setPriceMin] = useState("");
	const [priceMax, setPriceMax] = useState("");
	const [qtyMin, setQtyMin] = useState("");
	const [qtyMax, setQtyMax] = useState("");
	const [page, setPage] = useState(1);
	const [edits, setEdits] = useState<Record<string, RowEdit>>({});
	const [photo, setPhoto] = useState<{ src: string; title: string } | null>(
		null,
	);

	const { employees } = useEmployeesQuery();
	const { installations, total, totalPages } = useInstallations({
		...(tab === "pending" ? { status: "PENDING" as const } : {}),
		employeeId,
		type: typeFilter,
		search: debouncedSearch || undefined,
		...(dateFrom ? { from: new Date(dateFrom) } : {}),
		...(dateTo ? { to: new Date(dateTo) } : {}),
		...(priceMin !== "" ? { priceMin: Number(priceMin) } : {}),
		...(priceMax !== "" ? { priceMax: Number(priceMax) } : {}),
		...(qtyMin !== "" ? { qtyMin: Number(qtyMin) } : {}),
		...(qtyMax !== "" ? { qtyMax: Number(qtyMax) } : {}),
		page,
	});

	const approveInstallations = useApproveInstallations();
	const denyInstallation = useDenyInstallation();
	const updatePending = useUpdatePendingInstallation();

	function getEdit(inst: Installation): RowEdit {
		return (
			edits[inst.id] ?? {
				price: String(inst.price),
				quantity: String(inst.quantity),
			}
		);
	}

	async function handleApprove(inst: Installation) {
		if (!organizationId) {
			return;
		}
		const edit = edits[inst.id];
		try {
			// Commit inline edits first if changed
			if (
				edit &&
				(Number(edit.price) !== inst.price ||
					Number(edit.quantity) !== inst.quantity)
			) {
				await updatePending.mutateAsync({
					organizationId,
					id: inst.id,
					price: Number(edit.price),
					quantity: Number(edit.quantity),
				});
			}
			const { results } = await approveInstallations.mutateAsync({
				organizationId,
				ids: [inst.id],
			});
			const failed = results.find((r) => !r.ok);
			if (failed) {
				toast.error(failed.error ?? "Approval failed");
			} else {
				toast.success("Installation approved");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Approval failed",
			);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: getEdit/handleApprove read the current edits snapshot; edits is in the deps
	const columns = useMemo<ColumnDef<Installation, unknown>[]>(
		() => [
			{
				id: "item",
				header: "Item",
				cell: ({ row }) => {
					const inst = row.original;
					return (
						<div className="flex items-center gap-3">
							<MediaThumb inst={inst} onView={setPhoto} />
							<div className="min-w-0 space-y-0.5">
								<p className="truncate font-medium text-sm">
									{installationName(inst)}
								</p>
								<div className="flex items-center gap-1.5">
									<Badge
										variant="outline"
										className="px-1.5 py-0 text-[10px]"
									>
										{installationKind(inst)}
									</Badge>
									{inst.quantity > 1 && (
										<span className="text-muted-foreground text-xs tabular-nums">
											×{inst.quantity}
										</span>
									)}
									{inst.task?.completionPhotoUrl && (
										<ImageIcon className="size-3 text-muted-foreground" />
									)}
								</div>
								{inst.notes && !inst.isAddOn && (
									<p className="line-clamp-1 max-w-52 text-muted-foreground text-xs">
										{inst.notes}
									</p>
								)}
							</div>
						</div>
					);
				},
			},
			{
				id: "target",
				header: "Customer / Station / Base",
				cell: ({ row }) => {
					const inst = row.original;
					if (inst.customer) {
						const name =
							[inst.customer.firstName, inst.customer.lastName]
								.filter(Boolean)
								.join(" ") || inst.customer.username;
						return (
							<div>
								<Link
									to="/app/$organizationSlug/customers/$customerId"
									params={{
										organizationSlug,
										customerId: inst.customer.id,
									}}
									className="text-sm font-medium hover:underline"
									preload="intent"
								>
									{name}
								</Link>
								{inst.customer.address && (
									<p className="line-clamp-1 max-w-52 text-xs text-muted-foreground">
										{inst.customer.address}
									</p>
								)}
							</div>
						);
					}
					if (inst.station) {
						return (
							<span className="text-sm">
								{inst.station.name}{" "}
								<span className="text-xs text-muted-foreground">
									(station)
								</span>
							</span>
						);
					}
					if (inst.base) {
						return (
							<span className="text-sm">
								{inst.base.name}{" "}
								<span className="text-xs text-muted-foreground">
									(base)
								</span>
							</span>
						);
					}
					return (
						<span className="text-muted-foreground">&mdash;</span>
					);
				},
			},
			{
				id: "worker",
				header: "Worker",
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.employee.name}
					</span>
				),
			},
			{
				id: "quantity",
				header: "Qty",
				cell: ({ row }) => {
					const inst = row.original;
					if (inst.status !== "PENDING") {
						return (
							<span className="font-mono text-sm tabular-nums">
								{inst.quantity}
							</span>
						);
					}
					return (
						<PermissionGate
							resource="installations"
							action="approve"
							fallback={
								<span className="font-mono text-sm tabular-nums">
									{inst.quantity}
								</span>
							}
						>
							<Input
								type="number"
								min={1}
								className="h-8 w-16 font-mono"
								value={getEdit(inst).quantity}
								onChange={(e) =>
									setEdits((prev) => ({
										...prev,
										[inst.id]: {
											...getEdit(inst),
											quantity: e.target.value,
										},
									}))
								}
							/>
						</PermissionGate>
					);
				},
			},
			{
				id: "price",
				header: "Price",
				cell: ({ row }) => {
					const inst = row.original;
					if (inst.status !== "PENDING") {
						return (
							<span className="font-mono text-sm tabular-nums">
								{formatCurrency(inst.price)}
							</span>
						);
					}
					return (
						<PermissionGate
							resource="installations"
							action="approve"
							fallback={
								<span className="font-mono text-sm tabular-nums">
									{formatCurrency(inst.price)}
								</span>
							}
						>
							<Input
								type="number"
								min={0}
								step="0.01"
								className="h-8 w-24 font-mono"
								value={getEdit(inst).price}
								onChange={(e) =>
									setEdits((prev) => ({
										...prev,
										[inst.id]: {
											...getEdit(inst),
											price: e.target.value,
										},
									}))
								}
							/>
						</PermissionGate>
					);
				},
			},
			{
				id: "installedAt",
				header: "Date",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-sm tabular-nums">
						{formatDate(row.original.installedAt, {
							dateStyle: "medium",
						})}
					</span>
				),
			},
			...(tab === "history"
				? [
						{
							id: "status",
							header: "Status",
							enableSorting: false,
							cell: ({ row }) => {
								const inst = row.original;
								const cfg =
									STATUS_BADGES[
										inst.status as InstallationStatus
									];
								return (
									<div className="space-y-1">
										<Badge variant={cfg.variant}>
											{cfg.label}
										</Badge>
										{inst.approvedBy && (
											<p className="text-muted-foreground text-xs">
												by {inst.approvedBy.name}
												{inst.approvedAt
													? ` · ${formatDate(inst.approvedAt, { dateStyle: "medium" })}`
													: ""}
											</p>
										)}
									</div>
								);
							},
						} satisfies ColumnDef<Installation, unknown>,
					]
				: [
						{
							id: "actions",
							enableSorting: false,
							cell: ({ row }) => {
								const inst = row.original;
								return (
									<PermissionGate
										resource="installations"
										action="approve"
									>
										<div className="flex gap-1.5">
											<Button
												size="sm"
												disabled={
													approveInstallations.isPending
												}
												onClick={() =>
													handleApprove(inst)
												}
											>
												<CheckIcon className="mr-1 size-3.5" />
												Approve
											</Button>
											<Button
												size="sm"
												variant="outline"
												disabled={
													denyInstallation.isPending
												}
												onClick={async () => {
													if (!organizationId) {
														return;
													}
													try {
														await denyInstallation.mutateAsync(
															{
																organizationId,
																id: inst.id,
															},
														);
														toast.success(
															"Installation denied",
														);
													} catch (error) {
														toast.error(
															error instanceof
																Error
																? error.message
																: "Failed to deny",
														);
													}
												}}
											>
												<XIcon className="mr-1 size-3.5" />
												Deny
											</Button>
										</div>
									</PermissionGate>
								);
							},
						} satisfies ColumnDef<Installation, unknown>,
					]),
		],
		// react-doctor-disable-next-line react-doctor/exhaustive-deps -- getEdit/handleApprove only close over reactive values already in deps (edits, organizationId, approveInstallations); listing the per-render function identities would rebuild columns every render and defeat the memo
		[
			tab,
			edits,
			organizationId,
			organizationSlug,
			approveInstallations,
			denyInstallation,
		],
	);

	return (
		<PageShell
			title="Installations"
			description="Review equipment and add-on installations submitted by field workers."
		>
			<ContentCard>
				<ContentCardToolbar>
					<div className="flex w-full flex-wrap items-center justify-between gap-2">
						<Tabs
							value={tab}
							onValueChange={(v) => {
								setTab(v as "pending" | "history");
								setPage(1);
							}}
						>
							<TabsList>
								<TabsTrigger value="pending">
									Pending
									{tab === "pending" && total > 0 && (
										<Badge
											variant="info"
											className="ml-1.5"
										>
											{total}
										</Badge>
									)}
								</TabsTrigger>
								<TabsTrigger value="history">
									History
								</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="flex items-center gap-2">
							<Input
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(1);
								}}
								placeholder="Search customer or item..."
								className="w-52"
							/>
							<Select
								value={typeFilter ?? "all"}
								onValueChange={(v) => {
									setTypeFilter(
										v === "all"
											? undefined
											: (v as
													| "item"
													| "station"
													| "base"
													| "addon"),
									);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-32">
									<SelectValue placeholder="All types" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All types
									</SelectItem>
									<SelectItem value="item">Items</SelectItem>
									<SelectItem value="station">
										Stations
									</SelectItem>
									<SelectItem value="base">Bases</SelectItem>
									<SelectItem value="addon">
										Add-ons
									</SelectItem>
								</SelectContent>
							</Select>
							<Select
								value={employeeId ?? "all"}
								onValueChange={(v) => {
									setEmployeeId(v === "all" ? undefined : v);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-40">
									<SelectValue placeholder="All workers" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All workers
									</SelectItem>
									{employees.map((emp) => (
										<SelectItem key={emp.id} value={emp.id}>
											{emp.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="mt-2 flex w-full flex-wrap items-center gap-2">
						<Input
							type="date"
							className="w-36"
							value={dateFrom}
							onChange={(e) => {
								setDateFrom(e.target.value);
								setPage(1);
							}}
							aria-label="From date"
						/>
						<span className="text-xs text-muted-foreground">
							to
						</span>
						<Input
							type="date"
							className="w-36"
							value={dateTo}
							onChange={(e) => {
								setDateTo(e.target.value);
								setPage(1);
							}}
							aria-label="To date"
						/>
						<Input
							type="number"
							className="w-24"
							placeholder="Min $"
							value={priceMin}
							onChange={(e) => {
								setPriceMin(e.target.value);
								setPage(1);
							}}
						/>
						<Input
							type="number"
							className="w-24"
							placeholder="Max $"
							value={priceMax}
							onChange={(e) => {
								setPriceMax(e.target.value);
								setPage(1);
							}}
						/>
						<Input
							type="number"
							className="w-24"
							placeholder="Min qty"
							value={qtyMin}
							onChange={(e) => {
								setQtyMin(e.target.value);
								setPage(1);
							}}
						/>
						<Input
							type="number"
							className="w-24"
							placeholder="Max qty"
							value={qtyMax}
							onChange={(e) => {
								setQtyMax(e.target.value);
								setPage(1);
							}}
						/>
					</div>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={installations}
					pageSize={30}
					emptyState={
						<EmptyState
							icon={WrenchIcon}
							title={
								tab === "pending"
									? "No pending installations"
									: "No installations found"
							}
							description={
								tab === "pending"
									? "Worker installation submissions will appear here for approval."
									: "Try adjusting your filters."
							}
						/>
					}
				/>

				{totalPages > 1 && (
					<div className="border-t px-4 py-3">
						<Pagination
							currentPage={page}
							totalItems={total}
							itemsPerPage={30}
							onChangeCurrentPage={setPage}
						/>
					</div>
				)}
			</ContentCard>

			{photo && (
				<ImageViewerDialog
					open={!!photo}
					onOpenChange={(open) => {
						if (!open) {
							setPhoto(null);
						}
					}}
					src={photo.src}
					title={photo.title}
				/>
			)}
		</PageShell>
	);
}
