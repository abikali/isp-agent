"use client";

import { formatCycleShort } from "@saas/billing/client";
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
import { useCustomersConnectivity } from "../hooks/use-customers";
import { ConnectivityCell } from "./ConnectivityCell";

const PAGE_SIZE = 10;

interface PaymentRow {
	id: string;
	paidAt: string | Date;
	accountPrice: number;
	paidAmount: number;
	freeAccount: boolean;
	stoppedAccount: boolean;
	// A debt visit collects nothing; without this the row rendered as a bare
	// $0.00 with no explanation.
	debtAccount?: boolean;
	notes: string | null;
	collector: {
		id: string;
		name: string;
	} | null;
	billingMonth: {
		year: number;
		month: number;
	} | null;
	/** The new customer this customer brought in (their free month's reason). */
	referredCustomer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
		online: boolean;
		lastLogin: string | Date | null;
		expiresAt: string | Date | null;
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
	// Live status for referred customers — "is the referral real?" check.
	const live = useCustomersConnectivity(
		payments.flatMap((p) =>
			p.referredCustomer ? [p.referredCustomer.id] : [],
		),
	);
	const rows = payments.map((p) => {
		const fresh = p.referredCustomer
			? live.get(p.referredCustomer.id)
			: undefined;
		return fresh && p.referredCustomer
			? { ...p, referredCustomer: { ...p.referredCustomer, ...fresh } }
			: p;
	});

	const columns = useMemo<ColumnDef<PaymentRow, unknown>[]>(
		() => [
			{
				id: "date",
				header: "Date",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) => formatDate(row.original.paidAt),
			},
			{
				id: "period",
				header: "Period",
				meta: {
					className:
						"hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell",
				},
				cell: ({ row }) => {
					const bm = row.original.billingMonth;
					return bm ? formatCycleShort(bm.year, bm.month) : "—";
				},
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
					if (p.stoppedAccount) {
						return (
							<Badge variant="destructive" className="text-xs">
								Stopped
							</Badge>
						);
					}
					if (p.debtAccount) {
						return (
							<Badge variant="warning" className="text-xs">
								Debt
							</Badge>
						);
					}
					return `$${p.paidAmount.toFixed(2)}`;
				},
			},
			{
				id: "collector",
				header: "Collector",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) => {
					const collector = row.original.collector;
					return collector ? (
						collector.name
					) : (
						<span className="text-muted-foreground">—</span>
					);
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
						<div className="flex items-center gap-1.5">
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
									Free month for bringing this customer — open
								</TooltipContent>
							</Tooltip>
							<ConnectivityCell
								status={referred.status}
								online={referred.online}
								lastLogin={referred.lastLogin}
								expiresAt={referred.expiresAt}
							/>
						</div>
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
					data={rows}
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
