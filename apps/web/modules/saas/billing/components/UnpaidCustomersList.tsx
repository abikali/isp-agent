"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { Pagination } from "@saas/shared/components/Pagination";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	BanknoteIcon,
	MessageCircleIcon,
	PhoneIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useState } from "react";
import { useCollectorStats, useUnpaidCustomers } from "../hooks/use-billing";
import { PaymentDialog } from "./PaymentDialog";

function CollectorStatsHeader() {
	const { data: stats, isLoading } = useCollectorStats();

	if (isLoading || !stats) {
		return (
			<div className="grid gap-3 grid-cols-3 mb-4">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-20" />
				))}
			</div>
		);
	}

	return (
		<div className="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4">
			<Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<UsersIcon className="h-4 w-4" />
						Collected Bills
					</div>
					<div className="text-2xl font-bold">
						{stats.paidCustomers}{" "}
						<span className="text-base font-normal text-muted-foreground">
							/ {stats.totalCustomers}
						</span>
					</div>
				</CardContent>
			</Card>
			<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<WalletIcon className="h-4 w-4" />
						Collected Money
					</div>
					<div className="text-2xl font-bold">
						{formatCurrency(stats.netBalance)}
					</div>
				</CardContent>
			</Card>
			<Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
				<CardContent className="p-4">
					<div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
						<BanknoteIcon className="h-4 w-4" />
						Today
					</div>
					<div className="text-2xl font-bold">
						{formatCurrency(stats.dailyCollected)}
						{stats.dailyCount > 0 && (
							<Badge variant="secondary" className="ml-2 text-xs">
								{stats.dailyCount} bills
							</Badge>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function formatWhatsAppLink(phone: string | null | undefined): string | null {
	if (!phone) {
		return null;
	}
	const digits = phone.replace(/\D/g, "");
	if (!digits) {
		return null;
	}
	const normalized = digits.startsWith("961")
		? digits
		: digits.startsWith("0")
			? `961${digits.slice(1)}`
			: `961${digits}`;
	return `https://wa.me/${normalized}`;
}

export function UnpaidCustomersList() {
	const { employee, isOrganizationAdmin } = useActiveOrganization();
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);
	const [selectedCustomer, setSelectedCustomer] = useState<
		Parameters<typeof PaymentDialog>[0]["customer"] | null
	>(null);

	const isCollector = !isOrganizationAdmin && !!employee?.id;

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
				{isCollector && <CollectorStatsHeader />}

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

									const waLink = formatWhatsAppLink(
										customer.phone,
									);

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
												<div className="flex items-center gap-1">
													{customer.phone && (
														<Button
															size="icon"
															variant="ghost"
															className="h-8 w-8"
															asChild
														>
															<a
																href={`tel:${customer.phone}`}
																title="Call"
															>
																<PhoneIcon className="size-3.5" />
															</a>
														</Button>
													)}
													{waLink && (
														<Button
															size="icon"
															variant="ghost"
															className="h-8 w-8 text-green-600"
															asChild
														>
															<a
																href={waLink}
																target="_blank"
																rel="noopener noreferrer"
																title="WhatsApp"
															>
																<MessageCircleIcon className="size-3.5" />
															</a>
														</Button>
													)}
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
												</div>
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
