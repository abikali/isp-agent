"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { ChevronLeftIcon, ChevronRightIcon, ReceiptIcon } from "lucide-react";
import { useState } from "react";

export function CustomerTransactions({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.customers.listTransactions.queryOptions({
					input: { organizationId, customerId, page, pageSize: 10 },
				})
			: disabledQuery(["customers", "listTransactions"]),
	);

	const transactions = data?.transactions ?? [];
	const total = data?.total ?? 0;
	const totalPages = data?.totalPages ?? 1;

	if (!isLoading && total === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<ReceiptIcon className="size-4" />
					Financial Transactions
					{total > 0 && (
						<Badge variant="secondary" className="ml-1">
							{total.toLocaleString()}
						</Badge>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading...</p>
				) : (
					<>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Date</TableHead>
									<TableHead className="text-right">
										Credit
									</TableHead>
									<TableHead className="text-right">
										Debit
									</TableHead>
									<TableHead className="hidden sm:table-cell">
										Notes
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{transactions.map((tx) => (
									<TableRow key={tx.id}>
										<TableCell className="text-xs">
											{new Date(
												tx.operationDate,
											).toLocaleDateString()}
										</TableCell>
										<TableCell className="text-right text-xs">
											{tx.credit > 0 ? (
												<span className="text-green-600">
													+$
													{tx.credit.toFixed(2)}
												</span>
											) : (
												"-"
											)}
										</TableCell>
										<TableCell className="text-right text-xs">
											{tx.debit > 0 ? (
												<span className="text-red-600">
													-$
													{tx.debit.toFixed(2)}
												</span>
											) : (
												"-"
											)}
										</TableCell>
										<TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground sm:table-cell">
											{tx.notes || "-"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						{totalPages > 1 && (
							<div className="mt-3 flex items-center justify-between">
								<span className="text-xs text-muted-foreground">
									Page {page} of {totalPages}
								</span>
								<div className="flex gap-1">
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
			</CardContent>
		</Card>
	);
}
