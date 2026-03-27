"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { Pagination } from "@saas/shared/components/Pagination";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { displayName } from "@shared/lib/display-name";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { BanknoteIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useUnpaidCustomers } from "../hooks/use-billing";
import { PaymentDialog } from "./PaymentDialog";

export function UnpaidCustomersList() {
	const { employee, isOrganizationAdmin } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);
	const [selectedCustomer, setSelectedCustomer] = useState<
		Parameters<typeof PaymentDialog>[0]["customer"] | null
	>(null);

	// Collectors see only their customers; admins see all
	const { customers, total, totalPages } = useUnpaidCustomers({
		collectorId: isOrganizationAdmin ? undefined : employee?.id,
		search: debouncedSearch || undefined,
		page,
	});

	return (
		<PageShell
			title="Collect Payments"
			description={`${total} unpaid customers`}
		>
			<div className="space-y-4">
				<SearchInput
					value={search}
					onChange={setSearch}
					placeholder="Search customers..."
				/>

				{customers.length === 0 ? (
					<EmptyState
						icon={UsersIcon}
						title="All paid up!"
						description="No unpaid customers found."
					/>
				) : (
					<div className="rounded-xl border bg-card">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Customer</TableHead>
									<TableHead>Plan</TableHead>
									<TableHead>Group</TableHead>
									<TableHead>Expiry</TableHead>
									<TableHead className="text-right">
										Amount Due
									</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{customers.map((customer) => {
									const accountPrice =
										customer.monthlyRate ??
										customer.plan?.monthlyPrice ??
										0;
									const totalDue =
										accountPrice +
										(customer.iptvPrice ?? 0) +
										(customer.realIpPrice ?? 0) -
										(customer.discount ?? 0);

									return (
										<TableRow key={customer.id}>
											<TableCell>
												<div className="font-medium">
													{displayName(
														customer.firstName,
														customer.lastName,
													)}
												</div>
												<div className="text-xs text-muted-foreground">
													{customer.username}
												</div>
											</TableCell>
											<TableCell className="text-sm">
												{customer.plan?.name ?? "—"}
											</TableCell>
											<TableCell className="text-sm">
												{customer.groupName ?? "—"}
											</TableCell>
											<TableCell className="text-sm">
												{customer.expiresAt
													? new Date(
															customer.expiresAt,
														).toLocaleDateString()
													: "—"}
											</TableCell>
											<TableCell className="text-right font-semibold tabular-nums">
												${totalDue.toFixed(2)}
											</TableCell>
											<TableCell>
												<Button
													size="sm"
													variant="outline"
													onClick={() =>
														setSelectedCustomer(
															customer,
														)
													}
												>
													<BanknoteIcon className="mr-1 size-3.5" />
													Pay
												</Button>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}

				{totalPages > 1 && (
					<Pagination
						totalItems={total}
						itemsPerPage={25}
						currentPage={page}
						onChangeCurrentPage={setPage}
					/>
				)}
			</div>

			{selectedCustomer && (
				<PaymentDialog
					open={!!selectedCustomer}
					onOpenChange={(open) => {
						if (!open) {
							setSelectedCustomer(null);
						}
					}}
					customer={selectedCustomer}
				/>
			)}
		</PageShell>
	);
}

export function UnpaidCustomersListSkeleton() {
	return (
		<PageShell title="Collect Payments" description="Loading...">
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<div className="rounded-xl border bg-card p-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4 py-3">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-24" />
							<Skeleton className="h-5 w-20" />
							<Skeleton className="ml-auto h-8 w-16" />
						</div>
					))}
				</div>
			</div>
		</PageShell>
	);
}
