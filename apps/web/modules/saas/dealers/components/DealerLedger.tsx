"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { useState } from "react";

/** Read-only ledger over IspDealerAccount rows (credit/debit/balance). */
export function DealerLedger({ dealerId }: { dealerId: string }) {
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		orpc.admin.dealers.ledger.queryOptions({
			input: { dealerId, page },
		}),
	);

	const entries = data?.entries ?? [];

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<CardTitle className="text-base">Account Ledger</CardTitle>
					{data && (
						<p className="text-sm text-muted-foreground">
							Credit{" "}
							<span className="font-mono tabular-nums text-foreground">
								{formatCurrency(data.totalCredit)}
							</span>{" "}
							· Debit{" "}
							<span className="font-mono tabular-nums text-foreground">
								{formatCurrency(data.totalDebit)}
							</span>
						</p>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-2">
						{Array.from({ length: 4 }).map((_, i) => (
							<Skeleton
								key={`ledger-skel-${i}`}
								className="h-10 rounded-md"
							/>
						))}
					</div>
				) : entries.length === 0 ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No ledger entries for this dealer.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
									<th className="py-2 pr-3 font-medium">
										Date
									</th>
									<th className="py-2 pr-3 font-medium">
										Comment
									</th>
									<th className="py-2 pr-3 text-right font-medium">
										Credit
									</th>
									<th className="py-2 pr-3 text-right font-medium">
										Debit
									</th>
									<th className="py-2 text-right font-medium">
										Balance
									</th>
								</tr>
							</thead>
							<tbody>
								{entries.map((entry) => (
									<tr
										key={entry.id}
										className="border-b last:border-0"
									>
										<td className="whitespace-nowrap py-2 pr-3 tabular-nums">
											{formatDate(entry.operationDate, {
												dateStyle: "medium",
											})}
										</td>
										<td className="max-w-72 py-2 pr-3">
											<span className="line-clamp-1 text-muted-foreground">
												{entry.comment ?? "—"}
											</span>
										</td>
										<td className="py-2 pr-3 text-right font-mono tabular-nums">
											{entry.credit
												? formatCurrency(entry.credit)
												: "—"}
										</td>
										<td className="py-2 pr-3 text-right font-mono tabular-nums">
											{entry.debit
												? formatCurrency(entry.debit)
												: "—"}
										</td>
										<td className="py-2 text-right font-mono font-medium tabular-nums">
											{formatCurrency(entry.balance)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{data && data.totalPages > 1 && (
					<div className="border-t pt-3">
						<Pagination
							currentPage={page}
							totalItems={data.total}
							itemsPerPage={50}
							onChangeCurrentPage={setPage}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
