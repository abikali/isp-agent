"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { SyncPreviewDialog } from "@shared/components/SyncPreviewDialog";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
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
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	CheckCircle2Icon,
	ClipboardCopyIcon,
	EyeIcon,
	LogInIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	UploadIcon,
	UserCheckIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useDeleteEmployee,
	useEmployees,
	useInviteEmployee,
	useUpdateEmployee,
} from "../hooks/use-employees";
import { EMPLOYEE_DEPARTMENT_LABELS } from "../lib/constants";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateEmployeeDialog } from "./CreateEmployeeDialog";
import { EmployeeFilters } from "./EmployeeFilters";
import { EmployeeStats } from "./EmployeeStats";
import { EmployeeStatsSkeleton } from "./EmployeeStatsSkeleton";

const statusMap: Record<string, "active" | "inactive" | "pending"> = {
	ACTIVE: "active",
	INACTIVE: "inactive",
	ON_LEAVE: "pending",
};

const PAGE_SIZE = 25;

const SORT_BY_MAP = {
	name: "name",
	employeeNumber: "employeeNumber",
	status: "status",
} as const satisfies Record<
	string,
	"name" | "employeeNumber" | "createdAt" | "status"
>;

interface EmployeeRow {
	id: string;
	status: string;
	employeeNumber: string;
	name: string;
	email: string | null;
	phone: string | null;
	position: string | null;
	department: string | null;
	hireDate: Date | null;
	userId: string | null;
	externalId: string | null;
	stations: Array<{ station: { id: string; name: string } }>;
	dealer: { id: string; name: string } | null;
	_count: { customerCollections: number; taskAssignments: number };
	createdAt: Date;
}

export function EmployeesList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [department, setDepartment] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [showSyncPreview, setShowSyncPreview] = useState(false);

	const selectedIds = useMemo(
		() => Object.keys(rowSelection),
		[rowSelection],
	);
	const selectedCount = selectedIds.length;

	const [deactivateTarget, setDeactivateTarget] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		() => setPage(1),
	);
	const deleteEmployee = useDeleteEmployee();
	const inviteEmployee = useInviteEmployee();
	const updateEmployee = useUpdateEmployee();

	const filters = {
		search: debouncedSearch || undefined,
		status:
			status !== "all"
				? (status as "ACTIVE" | "INACTIVE" | "ON_LEAVE")
				: undefined,
		department:
			department !== "all"
				? (department as
						| "TECHNICAL"
						| "CUSTOMER_SERVICE"
						| "BILLING"
						| "MANAGEMENT"
						| "FIELD_OPS")
				: undefined,
		stationId: stationId !== "all" ? stationId : undefined,
		page,
		sortBy,
		sortOrder,
	};

	const { employees, total, isLoading, isFetching } = useEmployees(filters);

	const columns = useMemo<ColumnDef<EmployeeRow, unknown>[]>(
		() => [
			{
				id: "status",
				accessorFn: (row) => row.status,
				enableSorting: true,
				meta: { className: "w-10 pr-0" },
				cell: ({ row }) => (
					<StatusIndicator
						status={statusMap[row.original.status] ?? "inactive"}
						label=""
						size="sm"
					/>
				),
			},
			{
				id: "employeeNumber",
				header: "ID",
				accessorFn: (row) => row.employeeNumber,
				enableSorting: true,
				cell: ({ row }) => (
					<Link
						to="/app/$organizationSlug/employees/$employeeId"
						params={{
							organizationSlug,
							employeeId: row.original.id,
						}}
						className="font-mono text-xs text-primary hover:underline"
						preload="intent"
					>
						{row.original.employeeNumber}
					</Link>
				),
			},
			{
				id: "name",
				header: "Name",
				accessorFn: (row) => row.name,
				enableSorting: true,
				cell: ({ row }) => (
					<div>
						<Link
							to="/app/$organizationSlug/employees/$employeeId"
							params={{
								organizationSlug,
								employeeId: row.original.id,
							}}
							className="font-medium hover:underline"
							preload="intent"
						>
							{row.original.name}
						</Link>
						{row.original.email && (
							<p className="text-xs text-muted-foreground truncate max-w-[200px]">
								{row.original.email}
							</p>
						)}
					</div>
				),
			},
			{
				id: "phone",
				header: "Phone",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.phone ? (
						<span className="text-sm">{row.original.phone}</span>
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "department",
				header: "Department",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.department ? (
						<Badge variant="outline" className="font-normal">
							{EMPLOYEE_DEPARTMENT_LABELS[
								row.original.department
							] ?? row.original.department}
						</Badge>
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "stations",
				header: "Station(s)",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.stations.length > 0 ? (
						<span className="text-sm">
							{row.original.stations
								.map((s) => s.station.name)
								.join(", ")}
						</span>
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "customers",
				header: "Customers",
				enableSorting: false,
				meta: { className: "hidden xl:table-cell text-center" },
				cell: ({ row }) => {
					const count = row.original._count.customerCollections;
					return count > 0 ? (
						<span className="text-sm tabular-nums">{count}</span>
					) : (
						<span className="text-muted-foreground">-</span>
					);
				},
			},
			{
				id: "login",
				header: "Login",
				enableSorting: false,
				meta: { className: "hidden sm:table-cell w-16 text-center" },
				cell: ({ row }) =>
					row.original.userId ? (
						<CheckCircle2Icon className="size-4 text-green-600 mx-auto" />
					) : (
						<span className="text-muted-foreground text-xs">
							No
						</span>
					),
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-20" },
				cell: ({ row }) => {
					const emp = row.original;
					return (
						<div className="flex items-center gap-1 justify-end">
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								asChild
							>
								<Link
									to="/app/$organizationSlug/employees/$employeeId"
									params={{
										organizationSlug,
										employeeId: emp.id,
									}}
									preload="intent"
								>
									<PencilIcon className="size-4" />
									<span className="sr-only">Edit</span>
								</Link>
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-8"
									>
										<MoreHorizontalIcon className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link
											to="/app/$organizationSlug/employees/$employeeId"
											params={{
												organizationSlug,
												employeeId: emp.id,
											}}
										>
											<EyeIcon className="mr-2 size-4" />
											View Details
										</Link>
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => {
											navigator.clipboard.writeText(
												emp.employeeNumber,
											);
											toast.success("Employee # copied");
										}}
									>
										<ClipboardCopyIcon className="mr-2 size-4" />
										Copy Employee #
									</DropdownMenuItem>
									{emp.phone && (
										<DropdownMenuItem
											onClick={() => {
												navigator.clipboard.writeText(
													emp.phone ?? "",
												);
												toast.success("Phone copied");
											}}
										>
											<ClipboardCopyIcon className="mr-2 size-4" />
											Copy Phone
										</DropdownMenuItem>
									)}
									{!emp.userId && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onClick={() => {
													if (!organizationId) {
														return;
													}
													toast.promise(
														inviteEmployee.mutateAsync(
															{
																organizationId,
																employeeId:
																	emp.id,
																role: "collector",
																username:
																	emp.name
																		.toLowerCase()
																		.replace(
																			/\s+/g,
																			".",
																		),
															},
														),
														{
															loading:
																"Creating login...",
															success:
																"Login created (password: 123456)",
															error: (error: {
																message?: string;
															}) =>
																error.message ??
																"Failed to create login",
														},
													);
												}}
											>
												<LogInIcon className="mr-2 size-4" />
												Quick Invite (Collector)
											</DropdownMenuItem>
										</>
									)}
									{emp.status === "INACTIVE" && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onClick={() => {
													if (!organizationId) {
														return;
													}
													toast.promise(
														updateEmployee.mutateAsync(
															{
																organizationId,
																id: emp.id,
																name: emp.name,
																status: "ACTIVE",
															},
														),
														{
															loading:
																"Activating...",
															success:
																"Employee activated",
															error: (error: {
																message?: string;
															}) =>
																error.message ??
																"Failed to activate",
														},
													);
												}}
											>
												<UserCheckIcon className="mr-2 size-4" />
												Activate
											</DropdownMenuItem>
										</>
									)}
									{emp.status === "ACTIVE" && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												className="text-destructive"
												onClick={() =>
													setDeactivateTarget({
														id: emp.id,
														name: emp.name,
													})
												}
											>
												<UserMinusIcon className="mr-2 size-4" />
												Deactivate
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				},
			},
		],
		[organizationSlug, organizationId, inviteEmployee, updateEmployee],
	);

	return (
		<PageShell
			title="Employees"
			actions={
				<>
					<BulkExportButton
						filters={{
							status: filters.status,
							department: filters.department,
							stationId: filters.stationId,
						}}
					/>
					<Button
						variant="outline"
						onClick={() => setShowImport(true)}
					>
						<UploadIcon className="mr-2 size-4" />
						Import
					</Button>
					<Button onClick={() => setShowCreate(true)}>
						<PlusIcon className="mr-2 size-4" />
						Add Employee
					</Button>
				</>
			}
		>
			<AsyncBoundary fallback={<EmployeeStatsSkeleton />}>
				<EmployeeStats />
			</AsyncBoundary>

			{selectedCount > 0 && (
				<div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
					<span className="text-sm text-muted-foreground">
						{selectedCount} selected
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setShowSyncPreview(true)}
					>
						<RefreshCwIcon className="mr-2 size-4" />
						Sync from iRadius
					</Button>
				</div>
			)}

			<ContentCard>
				<ContentCardToolbar>
					<EmployeeFilters
						bare
						search={search}
						onSearchChange={(v) => {
							setSearch(v);
							setPage(1);
						}}
						status={status}
						onStatusChange={(v) => {
							setStatus(v);
							setPage(1);
						}}
						department={department}
						onDepartmentChange={(v) => {
							setDepartment(v);
							setPage(1);
						}}
						stationId={stationId}
						onStationIdChange={(v) => {
							setStationId(v);
							setPage(1);
						}}
					/>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={employees}
					sorting={sorting}
					onSortingChange={onSortingChange}
					getRowClassName={(row) => {
						const s = row.original.status;
						if (s === "INACTIVE") {
							return "opacity-50";
						}
						if (s === "ON_LEAVE") {
							return "opacity-70 bg-amber-50/50 dark:bg-amber-950/10";
						}
						return undefined;
					}}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: (p) => {
							setPage(p);
							setRowSelection({});
						},
					}}
					isLoading={isLoading}
					isFetching={isFetching}
					enableRowSelection={(row) => !!row.original.externalId}
					rowSelection={rowSelection}
					onRowSelectionChange={setRowSelection}
					getRowId={(row) => row.id}
					emptyState={
						<EmptyState
							icon={UsersIcon}
							title={
								total === 0
									? "No employees yet"
									: "No results found"
							}
							description={
								total === 0
									? "Add your first employee to get started."
									: "Try adjusting your filters or search term."
							}
							action={
								total === 0 ? (
									<Button onClick={() => setShowCreate(true)}>
										<PlusIcon className="mr-2 size-4" />
										Add Employee
									</Button>
								) : undefined
							}
						/>
					}
				/>
			</ContentCard>

			<CreateEmployeeDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
			<SyncPreviewDialog
				open={showSyncPreview}
				onOpenChange={setShowSyncPreview}
				entityType="employee"
				entityIds={selectedIds}
				onSynced={() => setRowSelection({})}
			/>

			{/* Deactivate Confirmation */}
			<AlertDialog
				open={deactivateTarget !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeactivateTarget(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to deactivate{" "}
							<strong>{deactivateTarget?.name}</strong>? They will
							lose access to all assigned stations and tasks.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (organizationId && deactivateTarget) {
									deleteEmployee.mutate({
										organizationId,
										id: deactivateTarget.id,
									});
									setDeactivateTarget(null);
								}
							}}
						>
							Deactivate
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}
