"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { cn } from "@ui/lib";
import { PlusIcon, UploadIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useEmployees } from "../hooks/use-employees";
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

export function EmployeesList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [department, setDepartment] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);

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
	};

	const { employees, total, totalPages, isLoading, isFetching } =
		useEmployees(filters);

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

			{isLoading ? (
				<div className="rounded-xl shadow-card p-8 text-center text-muted-foreground">
					Loading employees...
				</div>
			) : employees.length === 0 ? (
				<EmptyState
					icon={UsersIcon}
					title={
						total === 0 ? "No employees yet" : "No results found"
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
			) : (
				<>
					<div
						className={cn(
							"rounded-xl shadow-card overflow-hidden transition-opacity",
							isFetching && "opacity-60",
						)}
					>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10" />
									<TableHead>Employee #</TableHead>
									<TableHead>Name</TableHead>
									<TableHead className="hidden md:table-cell">
										Position
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Department
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Station(s)
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Dealer
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{employees.map((employee) => (
									<TableRow
										key={employee.id}
										className="hover:bg-muted/30 transition-colors"
									>
										<TableCell className="w-10 pr-0">
											<StatusIndicator
												status={
													statusMap[
														employee.status
													] ?? "inactive"
												}
												label=""
												size="sm"
											/>
										</TableCell>
										<TableCell className="font-mono text-xs">
											<Link
												to="/app/$organizationSlug/employees/$employeeId"
												params={{
													organizationSlug,
													employeeId: employee.id,
												}}
												className="text-primary hover:underline"
												preload="intent"
											>
												{employee.employeeNumber}
											</Link>
										</TableCell>
										<TableCell>
											<div>
												<Link
													to="/app/$organizationSlug/employees/$employeeId"
													params={{
														organizationSlug,
														employeeId: employee.id,
													}}
													className="font-medium hover:underline"
													preload="intent"
												>
													{employee.name}
												</Link>
												{employee.email && (
													<p className="text-xs text-muted-foreground">
														{employee.email}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{employee.position ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{employee.department ? (
												(EMPLOYEE_DEPARTMENT_LABELS[
													employee.department
												] ?? employee.department)
											) : (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell">
											{employee.stations.length > 0 ? (
												employee.stations
													.map((s) => s.station.name)
													.join(", ")
											) : (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell">
											{employee.dealer?.name ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{totalPages > 1 && (
						<Pagination
							className="mt-4"
							totalItems={total}
							itemsPerPage={25}
							currentPage={page}
							onChangeCurrentPage={setPage}
						/>
					)}
				</>
			)}

			<CreateEmployeeDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
		</PageShell>
	);
}
