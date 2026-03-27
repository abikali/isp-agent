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
import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

export function CustomerInvoices({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.customers.listInvoices.queryOptions({
					input: { organizationId, customerId, page, pageSize: 10 },
				})
			: disabledQuery(["customers", "listInvoices"]),
	);

	const invoices = data?.invoices ?? [];
	const total = data?.total ?? 0;
	const totalPages = data?.totalPages ?? 1;

	if (!isLoading && total === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<FileTextIcon className="size-4" />
					Invoices
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
									<TableHead>Invoice #</TableHead>
									<TableHead>Date</TableHead>
									<TableHead className="text-right">
										Total
									</TableHead>
									<TableHead className="text-right hidden sm:table-cell">
										Tax
									</TableHead>
									<TableHead className="text-right">
										Total (TTC)
									</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{invoices.map((inv) => (
									<TableRow key={inv.id}>
										<TableCell className="text-xs font-mono">
											{inv.invoiceNumber || "-"}
										</TableCell>
										<TableCell className="text-xs">
											{new Date(
												inv.invoiceDate,
											).toLocaleDateString()}
										</TableCell>
										<TableCell className="text-right text-xs">
											${inv.total.toFixed(2)}
										</TableCell>
										<TableCell className="text-right text-xs hidden sm:table-cell">
											${inv.tax.toFixed(2)}
										</TableCell>
										<TableCell className="text-right text-xs font-medium">
											${inv.totalWithTax.toFixed(2)}
										</TableCell>
										<TableCell>
											<Badge
												variant={
													inv.paid
														? "success"
														: "destructive"
												}
												className="text-xs"
											>
												{inv.paid ? "Paid" : "Unpaid"}
											</Badge>
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
