"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { displayName } from "@shared/lib/display-name";
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
import { PencilIcon, PlusIcon, UploadIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useCustomers } from "../hooks/use-customers";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CustomerFilters } from "./CustomerFilters";
import { CustomerStats } from "./CustomerStats";
import { CustomerStatsSkeleton } from "./CustomerStatsSkeleton";

type CustomerStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";

const statusMap: Record<
	string,
	"active" | "inactive" | "suspended" | "pending"
> = {
	ACTIVE: "active",
	INACTIVE: "inactive",
	SUSPENDED: "suspended",
	PENDING: "pending",
};

export function CustomersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [planId, setPlanId] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [connectionType, setConnectionType] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);

	const filters = {
		search: debouncedSearch || undefined,
		status: status !== "all" ? (status as CustomerStatus) : undefined,
		planId: planId !== "all" ? planId : undefined,
		stationId: stationId !== "all" ? stationId : undefined,
		connectionType:
			connectionType !== "all"
				? (connectionType as
						| "FIBER"
						| "WIRELESS"
						| "DSL"
						| "CABLE"
						| "ETHERNET")
				: undefined,
		page,
	};

	const { customers, total, totalPages, isLoading, isFetching } =
		useCustomers(filters);

	return (
		<PageShell
			title="Customers"
			actions={
				<>
					<BulkExportButton
						filters={{
							status: filters.status,
							planId: filters.planId,
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
						Add Customer
					</Button>
				</>
			}
		>
			<AsyncBoundary fallback={<CustomerStatsSkeleton />}>
				<CustomerStats />
			</AsyncBoundary>

			<CustomerFilters
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
				planId={planId}
				onPlanIdChange={(v) => {
					setPlanId(v);
					setPage(1);
				}}
				stationId={stationId}
				onStationIdChange={(v) => {
					setStationId(v);
					setPage(1);
				}}
				connectionType={connectionType}
				onConnectionTypeChange={(v) => {
					setConnectionType(v);
					setPage(1);
				}}
			/>

			{isLoading ? (
				<div className="rounded-xl shadow-card p-8 text-center text-muted-foreground">
					Loading customers...
				</div>
			) : customers.length === 0 ? (
				<EmptyState
					icon={UsersIcon}
					title={
						total === 0 ? "No customers yet" : "No results found"
					}
					description={
						total === 0
							? "Add your first customer to get started."
							: "Try adjusting your filters or search term."
					}
					action={
						total === 0 ? (
							<Button onClick={() => setShowCreate(true)}>
								<PlusIcon className="mr-2 size-4" />
								Add Customer
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
									<TableHead>Account</TableHead>
									<TableHead>Name</TableHead>
									<TableHead className="hidden md:table-cell">
										Plan
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Station
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Connection
									</TableHead>
									<TableHead className="hidden sm:table-cell text-right">
										Balance
									</TableHead>
									<TableHead className="w-10" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{customers.map((customer) => (
									<TableRow
										key={customer.id}
										className="hover:bg-muted/30 transition-colors"
									>
										<TableCell className="w-10 pr-0">
											<StatusIndicator
												status={
													statusMap[
														customer.status
													] ?? "inactive"
												}
												label=""
												size="sm"
											/>
										</TableCell>
										<TableCell className="font-mono text-xs">
											<Link
												to="/app/$organizationSlug/customers/$customerId"
												params={{
													organizationSlug,
													customerId: customer.id,
												}}
												className="text-primary hover:underline"
												preload="intent"
											>
												{customer.accountNumber}
											</Link>
										</TableCell>
										<TableCell>
											<div>
												<Link
													to="/app/$organizationSlug/customers/$customerId"
													params={{
														organizationSlug,
														customerId: customer.id,
													}}
													className="font-medium hover:underline"
													preload="intent"
												>
													{displayName(
														customer.firstName,
														customer.lastName,
													)}
												</Link>
												{customer.email && (
													<p className="text-xs text-muted-foreground">
														{customer.email}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{customer.plan?.name ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell">
											{customer.station?.name ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell text-xs">
											{customer.connectionType ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden sm:table-cell text-right font-mono tabular-nums">
											${customer.balance.toFixed(2)}
										</TableCell>
										<TableCell className="w-10">
											<Button
												variant="ghost"
												size="icon"
												className="size-8"
												asChild
											>
												<Link
													to="/app/$organizationSlug/customers/$customerId"
													params={{
														organizationSlug,
														customerId: customer.id,
													}}
													preload="intent"
												>
													<PencilIcon className="size-4" />
													<span className="sr-only">
														Edit
													</span>
												</Link>
											</Button>
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

			<CreateCustomerDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
		</PageShell>
	);
}
