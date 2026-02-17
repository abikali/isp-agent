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
	PencilIcon,
	PlusIcon,
	UploadIcon,
} from "lucide-react";
import { useState } from "react";
import { useCustomers } from "../hooks/use-customers";
import { CUSTOMER_STATUS_LABELS } from "../lib/constants";
import { BulkExportButton } from "./BulkExportButton";
import { BulkImportDialog } from "./BulkImportDialog";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { CustomerFilters } from "./CustomerFilters";
import { CustomerStats } from "./CustomerStats";
import { CustomerStatsSkeleton } from "./CustomerStatsSkeleton";

export function CustomersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
	const [planId, setPlanId] = useState("all");
	const [stationId, setStationId] = useState("all");
	const [connectionType, setConnectionType] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);
	const [showImport, setShowImport] = useState(false);

	const filters = {
		search: search || undefined,
		status:
			status !== "all"
				? (status as "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING")
				: undefined,
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

	const { customers, total, totalPages } = useCustomers(filters);

	function getStatusVariant(s: string) {
		switch (s) {
			case "ACTIVE":
				return "default" as const;
			case "INACTIVE":
				return "secondary" as const;
			case "SUSPENDED":
				return "destructive" as const;
			case "PENDING":
				return "outline" as const;
			default:
				return "secondary" as const;
		}
	}

	return (
		<div>
			<AsyncBoundary fallback={<CustomerStatsSkeleton />}>
				<CustomerStats />
			</AsyncBoundary>

			<div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-bold">Customers</h1>
				<div className="flex items-center gap-2">
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
				</div>
			</div>

			<div className="mb-4">
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
			</div>

			{customers.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<h3 className="mb-1 text-lg font-medium">
						{total === 0 ? "No customers yet" : "No results found"}
					</h3>
					<p className="mb-4 text-sm text-muted-foreground">
						{total === 0
							? "Add your first customer to get started."
							: "Try adjusting your filters or search term."}
					</p>
					{total === 0 && (
						<Button onClick={() => setShowCreate(true)}>
							<PlusIcon className="mr-2 size-4" />
							Add Customer
						</Button>
					)}
				</div>
			) : (
				<>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Account</TableHead>
									<TableHead>Name</TableHead>
									<TableHead className="hidden md:table-cell">
										Plan
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Station
									</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="hidden sm:table-cell text-right">
										Balance
									</TableHead>
									<TableHead className="w-12" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{customers.map((customer) => (
									<TableRow key={customer.id}>
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
													{customer.fullName}
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
										<TableCell>
											<Badge
												variant={getStatusVariant(
													customer.status,
												)}
											>
												{CUSTOMER_STATUS_LABELS[
													customer.status
												] ?? customer.status}
											</Badge>
										</TableCell>
										<TableCell className="hidden sm:table-cell text-right font-mono">
											${customer.balance.toFixed(2)}
										</TableCell>
										<TableCell>
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

			<CreateCustomerDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
			<BulkImportDialog open={showImport} onOpenChange={setShowImport} />
		</div>
	);
}
