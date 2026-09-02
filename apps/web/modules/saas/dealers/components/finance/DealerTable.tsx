"use client";

import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@ui/components/toggle-group";
import { cn } from "@ui/lib";
import {
	ArrowRightIcon,
	BatteryLowIcon,
	HandshakeIcon,
	PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DealerFinanceRow } from "../../hooks/use-dealer-finance";
import { relativeDays } from "../../lib/finance-labels";
import type { DealerFilter } from "./DealerTotals";

interface DealerTableProps {
	dealers: DealerFinanceRow[];
	slug: string;
	isOperator: boolean;
	canManage: boolean;
	filter: DealerFilter;
	onFilter: (filter: DealerFilter) => void;
	onRecordPayment: (dealer: DealerFinanceRow) => void;
	onAddCredit: (dealer: DealerFinanceRow) => void;
}

const FILTERS: Array<{ value: DealerFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "owing", label: "Owing" },
	{ value: "low", label: "Low credit" },
	{ value: "settled", label: "Settled" },
];

function matches(dealer: DealerFinanceRow, filter: DealerFilter): boolean {
	switch (filter) {
		case "owing":
			return dealer.owed > 0;
		case "low":
			return dealer.lowCredit;
		case "settled":
			return dealer.owed <= 0;
		default:
			return true;
	}
}

/**
 * Every dealer, biggest debt first. The two money columns carry a meaning
 * line under the header so nobody has to remember which is which.
 */
export function DealerTable({
	dealers,
	slug,
	isOperator,
	canManage,
	filter,
	onFilter,
	onRecordPayment,
	onAddCredit,
}: DealerTableProps) {
	const [search, setSearch] = useState("");

	const rows = useMemo(() => {
		const term = search.trim().toLowerCase();
		return dealers
			.filter(
				(d) =>
					matches(d, filter) &&
					(!term ||
						[d.name, d.username, d.companyName, d.parentName].some(
							(v) => v?.toLowerCase().includes(term),
						)),
			)
			.sort((a, b) => b.owed - a.owed || b.prepaid - a.prepaid);
	}, [dealers, filter, search]);

	return (
		<ContentCard>
			<ContentCardToolbar
				actions={
					<span className="text-xs text-muted-foreground tabular-nums">
						{rows.length} of {dealers.length}
					</span>
				}
			>
				{isOperator && (
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Find a dealer…"
						className="w-full sm:w-56"
					/>
				)}
				<ToggleGroup
					type="single"
					size="sm"
					variant="outline"
					value={filter}
					onValueChange={(value) => {
						if (value) {
							onFilter(value as DealerFilter);
						}
					}}
					aria-label="Filter dealers"
				>
					{FILTERS.map((f) => (
						<ToggleGroupItem key={f.value} value={f.value}>
							{f.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</ContentCardToolbar>

			{rows.length === 0 ? (
				<EmptyState
					icon={HandshakeIcon}
					title={
						dealers.length === 0
							? "No dealers yet"
							: "Nobody matches this filter"
					}
					description={
						dealers.length === 0
							? "Dealers appear here after the first sync from iRadius."
							: "Try another filter or clear the search."
					}
				/>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
								<th className="px-4 py-2.5 font-medium">
									Dealer
								</th>
								<th className="px-3 py-2.5 text-right font-medium">
									{isOperator ? "Owes you" : "You owe"}
								</th>
								<th className="px-3 py-2.5 text-right font-medium">
									Credit left
								</th>
								<th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">
									This month
								</th>
								<th className="hidden px-3 py-2.5 font-medium lg:table-cell">
									Last payment
								</th>
								<th className="px-3 py-2.5" />
							</tr>
						</thead>
						<tbody>
							{rows.map((dealer) => (
								<tr
									key={dealer.id}
									className="group border-b border-border last:border-0 hover:bg-muted/40"
								>
									<td className="px-4 py-3">
										<Link
											to="/app/$organizationSlug/dealers/$dealerId"
											params={{
												organizationSlug: slug,
												dealerId: dealer.id,
											}}
											className="block min-w-0"
										>
											<div className="flex items-center gap-2">
												<span className="truncate font-medium group-hover:underline">
													{dealer.name}
												</span>
												{dealer.isSubDealer &&
													dealer.parentName && (
														<Badge
															variant="outline"
															className="shrink-0"
														>
															under{" "}
															{dealer.parentName}
														</Badge>
													)}
												{dealer.status !== "ACTIVE" && (
													<Badge
														variant="secondary"
														className="shrink-0"
													>
														Inactive
													</Badge>
												)}
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{[
													dealer.username,
													dealer.companyName,
												]
													.filter(Boolean)
													.join(" · ") || "—"}
												{dealer.customersCount > 0 &&
													` · ${dealer.customersCount} subscribers`}
											</div>
										</Link>
									</td>
									<td
										className={cn(
											"px-3 py-3 text-right font-mono tabular-nums",
											dealer.owed > 0
												? "font-medium"
												: dealer.owed < 0
													? "text-info"
													: "text-muted-foreground",
										)}
									>
										{dealer.owed === 0
											? "Settled"
											: formatCurrency(dealer.owed)}
									</td>
									<td className="px-3 py-3 text-right font-mono tabular-nums">
										<span
											className={cn(
												"inline-flex items-center gap-1.5",
												dealer.lowCredit &&
													"text-warning",
											)}
										>
											{dealer.lowCredit && (
												<BatteryLowIcon className="size-3.5" />
											)}
											{formatCurrency(dealer.prepaid)}
										</span>
									</td>
									<td className="hidden px-3 py-3 text-right font-mono tabular-nums text-muted-foreground md:table-cell">
										{dealer.chargedThisMonth > 0
											? formatCurrency(
													dealer.chargedThisMonth,
												)
											: "—"}
									</td>
									<td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
										{dealer.lastPaymentAt
											? relativeDays(dealer.lastPaymentAt)
											: dealer.owed > 0
												? "Never"
												: "—"}
									</td>
									<td className="px-3 py-3">
										<div className="flex items-center justify-end gap-1">
											{canManage && (
												<>
													<Button
														size="sm"
														variant="ghost"
														className="hidden sm:inline-flex"
														onClick={() =>
															onRecordPayment(
																dealer,
															)
														}
													>
														Payment
													</Button>
													<Button
														size="sm"
														variant="ghost"
														className="hidden sm:inline-flex"
														onClick={() =>
															onAddCredit(dealer)
														}
													>
														<PlusIcon className="size-3.5" />
														Credit
													</Button>
												</>
											)}
											<Button
												size="icon"
												variant="ghost"
												aria-label={`Open ${dealer.name}`}
												asChild
											>
												<Link
													to="/app/$organizationSlug/dealers/$dealerId"
													params={{
														organizationSlug: slug,
														dealerId: dealer.id,
													}}
												>
													<ArrowRightIcon className="size-4" />
												</Link>
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</ContentCard>
	);
}
