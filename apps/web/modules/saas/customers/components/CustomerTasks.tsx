"use client";

import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { ClipboardListIcon } from "lucide-react";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

type TaskRow = Awaited<
	ReturnType<typeof orpcClient.tasks.list>
>["tasks"][number];

type TaskStatus = TaskRow["status"];
type TaskPriority = TaskRow["priority"];

const STATUS_VARIANT: Record<
	TaskStatus,
	"default" | "secondary" | "success" | "warning" | "info" | "destructive"
> = {
	OPEN: "info",
	IN_PROGRESS: "warning",
	ON_HOLD: "secondary",
	COMPLETED: "success",
	CANCELLED: "secondary",
};

const PRIORITY_VARIANT: Record<
	TaskPriority,
	"default" | "secondary" | "warning" | "destructive"
> = {
	LOW: "secondary",
	MEDIUM: "default",
	HIGH: "warning",
	URGENT: "destructive",
};

function titleCase(value: string): string {
	return value
		.toLowerCase()
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function CustomerTasks({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.tasks.list.queryOptions({
					input: {
						organizationId,
						customerId,
						page,
						pageSize: PAGE_SIZE,
					},
				})
			: disabledQuery(["tasks", "list"]),
	);

	const tasks = data?.tasks ?? [];
	const total = data?.total ?? 0;

	const columns = useMemo<ColumnDef<TaskRow, unknown>[]>(
		() => [
			{
				id: "title",
				header: "Title",
				meta: {
					className: "max-w-[220px] truncate text-sm font-medium",
				},
				cell: ({ row }) => row.original.title,
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge
						variant={STATUS_VARIANT[row.original.status]}
						className="text-xs"
					>
						{titleCase(row.original.status)}
					</Badge>
				),
			},
			{
				id: "priority",
				header: "Priority",
				cell: ({ row }) => (
					<Badge
						variant={PRIORITY_VARIANT[row.original.priority]}
						className="text-xs"
					>
						{titleCase(row.original.priority)}
					</Badge>
				),
			},
			{
				id: "category",
				header: "Category",
				meta: {
					className:
						"hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell",
				},
				cell: ({ row }) => titleCase(row.original.category),
			},
			{
				id: "dueDate",
				header: "Due",
				meta: { className: "text-xs whitespace-nowrap" },
				cell: ({ row }) =>
					row.original.dueDate ? (
						formatDate(row.original.dueDate)
					) : (
						<span className="text-muted-foreground">—</span>
					),
			},
			{
				id: "assignees",
				header: "Assignees",
				meta: { className: "text-xs" },
				cell: ({ row }) => {
					const names = row.original.assignments
						.map((a) => a.employee.name)
						.filter(Boolean);
					return names.length > 0 ? (
						<span className="truncate max-w-[180px]">
							{names.join(", ")}
						</span>
					) : (
						<span className="text-muted-foreground">—</span>
					);
				},
			},
			{
				id: "completedAt",
				header: "Completed",
				meta: {
					className:
						"hidden text-xs whitespace-nowrap text-muted-foreground sm:table-cell",
				},
				cell: ({ row }) =>
					row.original.completedAt
						? formatDate(row.original.completedAt)
						: "—",
			},
		],
		[],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<ClipboardListIcon className="size-4" />
					Tasks
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
					data={tasks}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					isLoading={isLoading}
					emptyState={
						<p className="py-8 text-center text-sm text-muted-foreground">
							No tasks for this customer.
						</p>
					}
				/>
			</CardContent>
		</Card>
	);
}
