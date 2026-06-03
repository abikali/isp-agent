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
import { GiftIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

interface ReferralRow {
	id: string;
	paidAt: string | Date;
	billingMonth: {
		year: number;
		month: number;
	} | null;
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		plan: { id: string; name: string } | null;
	};
}

export function CustomerReferrals({
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
						referredCustomerId: customerId,
						freeAccount: true,
						page,
						pageSize: PAGE_SIZE,
					},
				})
			: disabledQuery(["billing", "payments", "list"]),
	);

	const referrals = (data?.payments ?? []) as unknown as ReferralRow[];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<ReferralRow, unknown>[]>(
		() => [
			{
				id: "customer",
				header: "Customer",
				cell: ({ row }) => {
					const c = row.original.customer;
					const name =
						displayName(c.firstName, c.lastName) ||
						c.username ||
						"—";
					return (
						<Link
							to="/app/$organizationSlug/customers/$customerId"
							params={{
								organizationSlug,
								customerId: c.id,
							}}
							preload="intent"
							className="font-medium text-sm hover:underline"
						>
							<span className="truncate max-w-[200px]">
								{name}
							</span>
						</Link>
					);
				},
			},
			{
				id: "plan",
				header: "Plan",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) => {
					const plan = row.original.customer.plan;
					return plan ? (
						plan.name
					) : (
						<span className="text-muted-foreground">—</span>
					);
				},
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
				id: "date",
				header: "Date",
				meta: {
					className:
						"text-xs whitespace-nowrap text-muted-foreground",
				},
				cell: ({ row }) => formatDate(row.original.paidAt),
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
					<GiftIcon className="size-4" />
					Referrals
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
					data={referrals}
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
