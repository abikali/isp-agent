"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	PlusIcon,
	UploadIcon,
} from "lucide-react";
import { useState } from "react";
import { useEmployees } from "../hooks/use-employees";
import {
	EMPLOYEE_DEPARTMENT_LABELS,
	EMPLOYEE_STATUS_LABELS,
} from "../lib/constants";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateEmployeeDialog } from "./CreateEmployeeDialog";
import { EmployeeFilters } from "./EmployeeFilters";
import { EmployeeStats } from "./EmployeeStats";
import { EmployeeStatsSkeleton } from "./EmployeeStatsSkeleton";

export function EmployeesList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
	const [department, setDepartment] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);

	const filters = {
		search: search || undefined,
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

	const { employees, total, totalPages } = useEmployees(filters);

	function getStatusVariant(s: string) {
		switch (s) {
			case "ACTIVE":
				return "default" as const;
			case "INACTIVE":
				return "secondary" as const;
			case "ON_LEAVE":
				return "outline" as const;
			default:
				return "secondary" as const;
		}
	}

	return (
		<div>
			<AsyncBoundary fallback={<EmployeeStatsSkeleton />}>
				<EmployeeStats />
			</AsyncBoundary>

			<div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Employees</h1>
				<div className="flex items-center gap-2">
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
				</div>
			</div>

			<div className="mb-4">
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
			</div>

			{employees.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<h3 className="mb-1 text-lg font-medium">
						{total === 0 ? "No employees yet" : "No results found"}
					</h3>
					<p className="mb-4 text-sm text-muted-foreground">
						{total === 0
							? "Add your first employee to get started."
							: "Try adjusting your filters or search term."}
					</p>
					{total === 0 && (
						<Button onClick={() => setShowCreate(true)}>
							<PlusIcon className="mr-2 size-4" />
							Add Employee
						</Button>
					)}
				</div>
			) : (
				<>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
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
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{employees.map((employee) => (
									<TableRow key={employee.id}>
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
										<TableCell>
											<Badge
												variant={getStatusVariant(
													employee.status,
												)}
											>
												{EMPLOYEE_STATUS_LABELS[
													employee.status
												] ?? employee.status}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{totalPages > 1 && (
						<div className="mt-4 flex items-center justify-between">
							<p className="text-sm text-muted-foreground">
								Showing {(page - 1) * 25 + 1}-
								{Math.min(page * 25, total)} of {total}
							</p>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setPage((p) => Math.max(1, p - 1))
									}
									disabled={page === 1}
								>
									<ChevronLeftIcon className="size-4" />
								</Button>
								<span className="text-sm">
									Page {page} of {totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setPage((p) =>
											Math.min(totalPages, p + 1),
										)
									}
									disabled={page === totalPages}
								>
									<ChevronRightIcon className="size-4" />
								</Button>
							</div>
						</div>
					)}
				</>
			)}

			<CreateEmployeeDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
		</div>
	);
}
