"use client";

import { formatDate } from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import {
	CheckCircle2Icon,
	DatabaseIcon,
	LoaderIcon,
	MonitorIcon,
} from "lucide-react";
import { useMemo } from "react";

// Mirrors ConflictField in @repo/jobs/sync-fields. Kept as a local type so this
// client file doesn't pull the jobs package into the browser bundle.
interface ConflictField {
	local: string | null;
	remote: string | null;
	resolution: "keep_local" | "keep_remote" | null;
}

type ConflictFields = Record<string, ConflictField>;

interface FlatRow {
	conflictId: string;
	fieldName: string;
	field: ConflictField;
}

function humanizeField(name: string): string {
	return name
		.replace(/^__/, "")
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
}

function formatValue(val: string | null): string {
	if (val == null) {
		return "—";
	}
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
		const d = new Date(val);
		if (!Number.isNaN(d.getTime())) {
			return formatDate(d);
		}
	}
	try {
		const parsed = JSON.parse(val);
		if (typeof parsed === "boolean") {
			return parsed ? "Yes" : "No";
		}
		if (Array.isArray(parsed)) {
			return (
				parsed
					.map((p) =>
						typeof p === "object" && p !== null
							? (p.number ?? JSON.stringify(p))
							: String(p),
					)
					.join(", ") || "—"
			);
		}
		return String(parsed);
	} catch {
		return val;
	}
}

export function CustomerSyncConflicts({ customerId }: { customerId: string }) {
	const organizationId = useOrganizationId();

	// listSyncConflicts has no customerId input — fetch the org's pending
	// conflicts and filter to this customer client-side (no backend change).
	const { data, isLoading } = useQuery(
		organizationId
			? orpc.customers.listSyncConflicts.queryOptions({
					input: {
						organizationId,
						status: "pending",
						page: 1,
						pageSize: 200,
					},
				})
			: disabledQuery(["customers", "listSyncConflicts"]),
	);

	const rows = useMemo<FlatRow[]>(() => {
		const conflicts = (data?.conflicts ?? []).filter(
			(c) => c.customer?.id === customerId,
		);
		const result: FlatRow[] = [];
		for (const conflict of conflicts) {
			const fields = conflict.fields as unknown as ConflictFields;
			for (const [fieldName, field] of Object.entries(fields)) {
				if (field.resolution !== null) {
					continue;
				}
				result.push({ conflictId: conflict.id, fieldName, field });
			}
		}
		return result;
	}, [data, customerId]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<LoaderIcon className="size-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
				<CheckCircle2Icon className="size-8 text-success" />
				<p className="text-sm">
					No pending sync conflicts for this customer.
				</p>
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="min-w-[120px]">Field</TableHead>
					<TableHead className="min-w-[140px]">
						<span className="flex items-center gap-1.5">
							<MonitorIcon className="size-3.5 text-muted-foreground" />
							Local value
						</span>
					</TableHead>
					<TableHead className="min-w-[140px]">
						<span className="flex items-center gap-1.5">
							<DatabaseIcon className="size-3.5 text-muted-foreground" />
							iRadius value
						</span>
					</TableHead>
					<TableHead>Status</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={`${row.conflictId}:${row.fieldName}`}>
						<TableCell>
							<Badge variant="secondary" className="font-normal">
								{humanizeField(row.fieldName)}
							</Badge>
						</TableCell>
						<TableCell className="max-w-[200px] truncate text-sm">
							{formatValue(row.field.local)}
						</TableCell>
						<TableCell className="max-w-[200px] truncate text-sm">
							{formatValue(row.field.remote)}
						</TableCell>
						<TableCell>
							<Badge variant="warning" className="text-xs">
								Pending
							</Badge>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
