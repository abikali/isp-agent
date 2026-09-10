"use client";

import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";

/**
 * Warns — never blocks — when the picked customer already has open work.
 * A maintenance visit and an uninstall can legitimately coexist; what the
 * owner wants is to see it before creating a duplicate.
 */
export function OpenTasksNotice({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();
	const { data } = useQuery(
		organizationId
			? orpc.tasks.list.queryOptions({
					input: {
						organizationId,
						customerId,
						statuses: ["OPEN", "PENDING_APPROVAL"],
						page: 1,
						pageSize: 10,
					},
				})
			: disabledQuery(["tasks", "list", "open", customerId]),
	);
	const tasks = data?.tasks ?? [];
	const total = data?.total ?? 0;
	if (total === 0) {
		return null;
	}
	return (
		<div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
			<p className="flex items-center gap-1.5 font-medium text-warning">
				<AlertTriangleIcon className="size-4" />
				Already has {total} open task{total === 1 ? "" : "s"}
			</p>
			<ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
				{tasks.map((t) => (
					<li key={t.id}>
						{t.title}
						{t.assignments?.length
							? ` · ${t.assignments
									.map((a) => a.employee?.name)
									.filter(Boolean)
									.join(", ")}`
							: ""}
						{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
					</li>
				))}
			</ul>
			<p className="mt-1.5 text-xs text-muted-foreground">
				You can still create another one if this visit is different.
			</p>
		</div>
	);
}
