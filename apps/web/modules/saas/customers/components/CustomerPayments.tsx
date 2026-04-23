"use client";

import { displayName } from "@shared/lib/display-name";
import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { BanknoteIcon, GiftIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

interface PaymentRow {
	id: string;
	paidAt: string | Date;
	accountPrice: number;
	paidAmount: number;
	freeAccount: boolean;
	stoppedAccount: boolean;
	notes: string | null;
	referredCustomer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
	} | null;
}

export function CustomerPayments({
	customerId,
	organizationSlug,
}: {
	customerId: string;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.billing.payments.list.queryOptions({
					input: {
						organizationId,
						customerId,
						page,
						pageSize: PAGE_SIZE,
					},
				})
			: disabledQuery(["billing", "payments", "list"]),
	);

	const payments = (data?.payments ?? []) as unknown as PaymentRow[];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(
		() => [
			{
				id: "date",
				header: "Date",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) => formatDate(row.original.paidAt),
			},
			{
				id: "amount",
				header: "Amount",
				meta: { className: "text-right text-xs font-medium" },
				cell: ({ row }) => {
					const p = row.original;
					if (p.freeAccount) {
						return (
							<Badge variant="secondary" className="text-xs">
								Free
							</Badge>
						);
					}
					return `$${p.paidAmount.toFixed(2)}`;
				},
			},
			{
				id: "referral",
				header: "Referral",
				cell: ({ row }) => {
					const referred = row.original.referredCustomer;
					if (!referred) {
						return (
							<span className="text-muted-foreground text-xs">
								—
							</span>
						);
					}
					const name =
						displayName(referred.firstName, referred.lastName) ||
						referred.username ||
						"—";
					return (
						<Tooltip>
							<TooltipTrigger asChild>
								<Link
									to="/app/$organizationSlug/customers/$customerId"
									params={{
										organizationSlug,
										customerId: referred.id,
									}}
									preload="intent"
									className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
								>
									<GiftIcon className="size-3.5" />
									<span className="truncate max-w-[180px]">
										{name}
									</span>
								</Link>
							</TooltipTrigger>
							<TooltipContent>
								Free via referral — open referrer
							</TooltipContent>
						</Tooltip>
					);
				},
			},
			{
				id: "notes",
				header: "Notes",
				meta: {
					className:
						"hidden max-w-[200px] truncate text-xs text-muted-foreground sm:table-cell",
				},
				cell: ({ row }) => row.original.notes || "-",
			},
		],
		[organizationSlug],
	);

	if (!isLoading && total === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<BanknoteIcon className="size-4" />
					Payments
					{total > 0 && (
						<Badge variant="secondary" className="ml-1">
							{total.toLocaleString()}
						</Badge>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<DataTable
					columns={columns}
					data={payments}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					isLoading={isLoading}
				/>
			</CardContent>
		</Card>
	);
}
