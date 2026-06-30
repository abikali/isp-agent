"use client";

import { TaskRowDetails } from "@saas/tasks/components/TaskRowDetails";
import { useTaskColumns } from "@saas/tasks/components/task-columns";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import { TooltipProvider } from "@ui/components/tooltip";
import { ClipboardListIcon } from "lucide-react";
import { useState } from "react";

const PAGE_SIZE = 10;

// The customer column is redundant inside a single customer's own tab, so it
// stays hidden here; every other column matches the standalone /tasks table.
const COLUMN_VISIBILITY = { customer: false } as const;

export function CustomerTasks({
	customerId,
	organizationSlug,
}: {
	customerId: string;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const [page, setPage] = useState(1);

	const { data, isLoading, isFetching } = useQuery(
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

	const columns = useTaskColumns(organizationSlug);

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
				<TooltipProvider>
					<DataTable
						columns={columns}
						data={tasks}
						isLoading={isLoading}
						isFetching={isFetching}
						columnVisibility={COLUMN_VISIBILITY}
						getRowId={(row) => row.id}
						renderSubRow={(row) => (
							<TaskRowDetails
								task={row.original}
								organizationSlug={organizationSlug}
							/>
						)}
						pagination={{
							totalItems: total,
							currentPage: page,
							itemsPerPage: PAGE_SIZE,
							onPageChange: setPage,
						}}
						emptyState={
							<p className="py-8 text-center text-sm text-muted-foreground">
								No tasks for this customer.
							</p>
						}
					/>
				</TooltipProvider>
			</CardContent>
		</Card>
	);
}
