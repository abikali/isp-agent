"use client";

import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { MessageSquareIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

type FollowupRow = Awaited<
	ReturnType<typeof orpcClient.followups.list>
>["followups"][number];

export function CustomerFollowups({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.followups.list.queryOptions({
					input: {
						organizationId,
						customerId,
						page,
						pageSize: PAGE_SIZE,
					},
				})
			: disabledQuery(["followups", "list"]),
	);

	const followups = data?.followups ?? [];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<FollowupRow, unknown>[]>(
		() => [
			{
				id: "status",
				header: "Status",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) => (
					<Badge variant="secondary" className="text-xs capitalize">
						{row.original.status || "new"}
					</Badge>
				),
			},
			{
				id: "details",
				header: "Details",
				meta: { className: "max-w-[360px] text-sm" },
				cell: ({ row }) => {
					const { note, collectorNote } = row.original;
					if (!note && !collectorNote) {
						return (
							<span className="text-muted-foreground">
								No details
							</span>
						);
					}
					return (
						<div className="space-y-0.5">
							{note && (
								<p className="whitespace-pre-wrap">{note}</p>
							)}
							{collectorNote && (
								<p className="text-xs text-muted-foreground">
									<span className="font-medium">
										Collector:
									</span>{" "}
									{collectorNote}
								</p>
							)}
						</div>
					);
				},
			},
			{
				id: "isDone",
				header: "Done",
				cell: ({ row }) =>
					row.original.isDone ? (
						<Badge variant="success" className="text-xs">
							Done
							{row.original.doneAt
								? ` · ${formatDate(row.original.doneAt)}`
								: ""}
						</Badge>
					) : (
						<Badge variant="warning" className="text-xs">
							Pending
						</Badge>
					),
			},
			{
				id: "createdAt",
				header: "Created",
				meta: {
					className:
						"text-xs whitespace-nowrap text-muted-foreground",
				},
				cell: ({ row }) => formatDate(row.original.createdAt),
			},
		],
		[],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<MessageSquareIcon className="size-4" />
					Follow-ups
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
					data={followups}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					isLoading={isLoading}
					emptyState={
						<p className="py-8 text-center text-sm text-muted-foreground">
							No follow-ups for this customer.
						</p>
					}
				/>
			</CardContent>
		</Card>
	);
}
