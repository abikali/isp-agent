"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
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
	ClipboardCopyIcon,
	EyeIcon,
	LogInIcon,
	MoreHorizontalIcon,
	PlusIcon,
	UploadIcon,
	UserMinusIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useDeleteEmployee,
	useEmployees,
	useInviteEmployee,
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
	userId: string | null;
	stations: Array<{ station: { name: string } }>;
	dealer: { name: string } | null;
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
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		() => setPage(1),
	);
	const deleteEmployee = useDeleteEmployee();
	const inviteEmployee = useInviteEmployee();

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
				header: "Employee #",
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
							<p className="text-xs text-muted-foreground">
								{row.original.email}
							</p>
						)}
					</div>
				),
			},
			{
				id: "position",
				header: "Position",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.position ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "department",
				header: "Department",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.department ? (
						(EMPLOYEE_DEPARTMENT_LABELS[row.original.department] ??
						row.original.department)
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
						row.original.stations
							.map((s) => s.station.name)
							.join(", ")
					) : (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "dealer",
				header: "Dealer",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) =>
					row.original.dealer?.name ?? (
						<span className="text-muted-foreground">-</span>
					),
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-10" },
				cell: ({ row }) => {
					const emp = row.original;
					return (
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
													inviteEmployee.mutateAsync({
														organizationId,
														employeeId: emp.id,
														role: "collector",
														username: emp.name
															.toLowerCase()
															.replace(
																/\s+/g,
																".",
															),
													}),
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
								{emp.status === "ACTIVE" && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-destructive"
											onClick={() => {
												if (
													organizationId &&
													confirm(
														`Deactivate ${emp.name}?`,
													)
												) {
													deleteEmployee.mutate({
														organizationId,
														id: emp.id,
													});
												}
											}}
										>
											<UserMinusIcon className="mr-2 size-4" />
											Deactivate
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		],
		[organizationSlug, organizationId, deleteEmployee, inviteEmployee],
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

			<EmployeeFilters
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

			<DataTable
				columns={columns}
				data={employees}
				sorting={sorting}
				onSortingChange={onSortingChange}
				pagination={{
					totalItems: total,
					currentPage: page,
					itemsPerPage: PAGE_SIZE,
					onPageChange: setPage,
				}}
				isLoading={isLoading}
				isFetching={isFetching}
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

			<CreateEmployeeDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
		</PageShell>
	);
}
