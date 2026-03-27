"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { formatCurrency } from "@shared/lib/format";
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
import { HandshakeIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useDealers } from "../hooks/use-dealers";
import { CreateDealerDialog } from "./CreateDealerDialog";
import { DealerFilters } from "./DealerFilters";
import { DealerStats } from "./DealerStats";
import { DealerStatsSkeleton } from "./DealerStatsSkeleton";

const statusMap: Record<
	string,
	"active" | "inactive" | "suspended" | "pending"
> = {
	ACTIVE: "active",
	INACTIVE: "inactive",
	SUSPENDED: "suspended",
	PENDING: "pending",
};

export function DealersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [status, setStatus] = useState("all");
	const [page, setPage] = useState(1);
	const [showCreate, setShowCreate] = useState(false);

	const filters = {
		search: debouncedSearch || undefined,
		status:
			status !== "all"
				? (status as "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING")
				: undefined,
		page,
	};

	const { dealers, total, pageSize, isLoading, isFetching } =
		useDealers(filters);

	return (
		<PageShell
			title="Dealers"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Add Dealer
				</Button>
			}
		>
			<AsyncBoundary fallback={<DealerStatsSkeleton />}>
				<DealerStats />
			</AsyncBoundary>

			<DealerFilters
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
			/>

			{isLoading ? (
				<div className="rounded-xl shadow-card p-8 text-center text-muted-foreground">
					Loading dealers...
				</div>
			) : dealers.length === 0 ? (
				<EmptyState
					icon={HandshakeIcon}
					title={total === 0 ? "No dealers yet" : "No results found"}
					description={
						total === 0
							? "Add your first dealer to get started."
							: "Try adjusting your filters or search term."
					}
					action={
						total === 0 ? (
							<Button onClick={() => setShowCreate(true)}>
								<PlusIcon className="mr-2 size-4" />
								Add Dealer
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
									<TableHead>Name</TableHead>
									<TableHead className="hidden md:table-cell">
										Company
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Phone
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Customers
									</TableHead>
									<TableHead className="hidden lg:table-cell">
										Employees
									</TableHead>
									<TableHead className="hidden lg:table-cell text-right">
										Credit
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{dealers.map((dealer) => (
									<TableRow
										key={dealer.id}
										className="hover:bg-muted/30 transition-colors"
									>
										<TableCell className="w-10 pr-0">
											<StatusIndicator
												status={
													statusMap[dealer.status] ??
													"inactive"
												}
												label=""
												size="sm"
											/>
										</TableCell>
										<TableCell>
											<div>
												<Link
													to="/app/$organizationSlug/dealers/$dealerId"
													params={{
														organizationSlug,
														dealerId: dealer.id,
													}}
													className="font-medium hover:underline"
													preload="intent"
												>
													{dealer.name}
												</Link>
												{dealer.email && (
													<p className="text-xs text-muted-foreground">
														{dealer.email}
													</p>
												)}
											</div>
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{dealer.companyName ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{dealer.phone ?? (
												<span className="text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="hidden lg:table-cell tabular-nums">
											{dealer._count.customers}
										</TableCell>
										<TableCell className="hidden lg:table-cell tabular-nums">
											{dealer._count.employees}
										</TableCell>
										<TableCell className="hidden lg:table-cell text-right font-mono tabular-nums">
											{typeof dealer.credit === "number"
												? formatCurrency(dealer.credit)
												: "-"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{total > pageSize && (
						<Pagination
							className="mt-4"
							totalItems={total}
							itemsPerPage={pageSize}
							currentPage={page}
							onChangeCurrentPage={setPage}
						/>
					)}
				</>
			)}

			<CreateDealerDialog
				open={showCreate}
				onOpenChange={setShowCreate}
			/>
		</PageShell>
	);
}
