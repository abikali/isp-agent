"use client";

import { formatCurrency, formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { WrenchIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

type InstallationRow = Awaited<
	ReturnType<typeof orpcClient.installations.list>
>["installations"][number];

type InstallationStatus = InstallationRow["status"];

const STATUS_VARIANT: Record<
	InstallationStatus,
	"secondary" | "success" | "warning" | "info" | "destructive"
> = {
	PENDING: "warning",
	APPROVED: "info",
	COMPLETED: "success",
	DENIED: "destructive",
};

function installationName(row: InstallationRow): string {
	if (row.stockItem?.name) {
		return row.stockItem.name;
	}
	if (row.isAddOn) {
		return "Add-on";
	}
	if (row.station?.name) {
		return row.station.name;
	}
	return "—";
}

export function CustomerInstallations({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.installations.list.queryOptions({
					input: {
						organizationId,
						customerId,
						page,
						pageSize: PAGE_SIZE,
					},
				})
			: disabledQuery(["installations", "list"]),
	);

	const installations = data?.installations ?? [];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<InstallationRow, unknown>[]>(
		() => [
			{
				id: "item",
				header: "Item / Add-on",
				meta: {
					className: "max-w-[200px] truncate text-sm font-medium",
				},
				cell: ({ row }) => installationName(row.original),
			},
			{
				id: "quantity",
				header: "Qty",
				meta: { className: "text-right text-xs whitespace-nowrap" },
				cell: ({ row }) => row.original.quantity,
			},
			{
				id: "price",
				header: "Price",
				meta: { className: "text-right text-xs font-medium" },
				cell: ({ row }) => formatCurrency(row.original.price),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge
						variant={STATUS_VARIANT[row.original.status]}
						className="text-xs"
					>
						{row.original.status.charAt(0) +
							row.original.status.slice(1).toLowerCase()}
					</Badge>
				),
			},
			{
				id: "employee",
				header: "Employee",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) =>
					row.original.employee?.name ?? (
						<span className="text-muted-foreground">—</span>
					),
			},
			{
				id: "date",
				header: "Date",
				meta: {
					className:
						"text-xs whitespace-nowrap text-muted-foreground",
				},
				cell: ({ row }) => formatDate(row.original.installedAt),
			},
		],
		[],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<WrenchIcon className="size-4" />
					Installations
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
					data={installations}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					isLoading={isLoading}
					emptyState={
						<p className="py-8 text-center text-sm text-muted-foreground">
							No installations for this customer.
						</p>
					}
				/>
			</CardContent>
		</Card>
	);
}
