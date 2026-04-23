"use client";

import { SettingsItem } from "@saas/shared/client";
import { UserAvatar } from "@shared/components/UserAvatar";
import { formatDateTime } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { FilterIcon, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { AuditLogEntry } from "../lib/types";

const routeApi = getRouteApi(
	"/_saas/app/_org/$organizationSlug/settings/audit",
);

const ITEMS_PER_PAGE = 20;

const ACTION_CATEGORIES = [
	{ value: "auth", label: "Authentication" },
	{ value: "user", label: "Users" },
	{ value: "organization", label: "Organization" },
	{ value: "member", label: "Members" },
	{ value: "role", label: "Roles" },
	{ value: "payment", label: "Payments" },
	{ value: "api_key", label: "API Keys" },
	{ value: "webhook", label: "Webhooks" },
	{ value: "profile", label: "Profiles" },
	{ value: "contact", label: "Contacts" },
	{ value: "session", label: "Sessions" },
	{ value: "data", label: "Data Export" },
] as const;

function formatActionLabel(action: string) {
	return action
		.split(".")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

const actionPrefixVariants: Record<
	string,
	"default" | "secondary" | "outline"
> = {
	auth: "secondary",
	user: "default",
	organization: "outline",
	member: "default",
	role: "secondary",
	payment: "default",
	api_key: "secondary",
	webhook: "outline",
	profile: "default",
	contact: "default",
	session: "secondary",
	data: "outline",
};

function getActionBadgeVariant(
	action: string,
): "default" | "secondary" | "outline" {
	const prefix = action.split(".")[0];
	return prefix ? (actionPrefixVariants[prefix] ?? "outline") : "outline";
}

const auditLogColumns: ColumnDef<AuditLogEntry, unknown>[] = [
	{
		accessorKey: "user",
		header: "User",
		enableSorting: false,
		cell: ({ row }) => {
			const log = row.original;
			if (!log.user) {
				return (
					<span className="text-muted-foreground text-sm">
						System
					</span>
				);
			}
			return (
				<div className="flex items-center gap-2">
					<UserAvatar
						name={log.user.name ?? log.user.email}
						avatarUrl={log.user.image}
						className="size-7 shrink-0"
					/>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">
							{log.user.name}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							{log.user.email}
						</p>
					</div>
				</div>
			);
		},
	},
	{
		accessorKey: "action",
		header: "Action",
		enableSorting: false,
		cell: ({ row }) => (
			<Badge
				variant={getActionBadgeVariant(row.original.action)}
				className="whitespace-nowrap text-xs"
			>
				{formatActionLabel(row.original.action)}
			</Badge>
		),
	},
	{
		accessorKey: "resourceType",
		header: "Resource",
		enableSorting: false,
		meta: { className: "hidden md:table-cell" },
		cell: ({ row }) => {
			const log = row.original;
			return (
				<div>
					<span className="block text-muted-foreground text-sm capitalize">
						{log.resourceType}
					</span>
					{log.resourceId && (
						<span className="block font-mono text-muted-foreground/70 text-xs">
							{log.resourceId.slice(0, 8)}...
						</span>
					)}
				</div>
			);
		},
	},
	{
		accessorKey: "createdAt",
		header: "Timestamp",
		enableSorting: false,
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-muted-foreground text-sm">
				{formatDateTime(row.original.createdAt, {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
					hourCycle: "h23",
				})}
			</span>
		),
	},
	{
		accessorKey: "ipAddress",
		header: "IP Address",
		enableSorting: false,
		meta: { className: "hidden sm:table-cell" },
		cell: ({ row }) => (
			<span className="font-mono text-muted-foreground text-xs">
				{row.original.ipAddress ?? "-"}
			</span>
		),
	},
];

export function AuditLogsBlock({ organizationId }: { organizationId: string }) {
	const searchParams = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const currentPage = searchParams.page;
	const actionFilter = searchParams.action;

	const setCurrentPage = useCallback(
		(value: number) =>
			navigate({ search: (prev) => ({ ...prev, page: value }) }),
		[navigate],
	);
	const setActionFilter = useCallback(
		(value: string) =>
			navigate({ search: (prev) => ({ ...prev, action: value }) }),
		[navigate],
	);

	const [showFilters, setShowFilters] = useState(false);

	const { data, isLoading } = useQuery(
		orpc.audit.organization.list.queryOptions({
			input: {
				organizationId,
				action: actionFilter || undefined,
				limit: ITEMS_PER_PAGE,
				offset: (currentPage - 1) * ITEMS_PER_PAGE,
			},
		}),
	);

	const logs = (data?.logs as AuditLogEntry[]) ?? [];
	const hasActiveFilters = !!actionFilter;

	const clearFilters = () => {
		setActionFilter("");
		setCurrentPage(1);
	};

	return (
		<SettingsItem
			title="Audit Logs"
			description="View activity and changes within your organization"
			fullWidth
		>
			<div className="min-w-0 space-y-4">
				{/* Filters */}
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowFilters(!showFilters)}
					>
						<FilterIcon className="mr-2 size-4" />
						Filters
						{hasActiveFilters && (
							<Badge variant="secondary" className="ml-2">
								1
							</Badge>
						)}
					</Button>
					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearFilters}
						>
							<XIcon className="mr-2 size-4" />
							Clear
						</Button>
					)}
				</div>

				{showFilters && (
					<div className="flex flex-wrap gap-4 rounded-lg border bg-muted/50 p-4">
						<div className="flex flex-col gap-1">
							<span className="text-muted-foreground text-xs">
								Action
							</span>
							<Select
								value={actionFilter || "all"}
								onValueChange={(value) => {
									setActionFilter(
										value === "all" ? "" : value,
									);
									setCurrentPage(1);
								}}
							>
								<SelectTrigger
									className="w-full sm:w-[180px]"
									aria-label="Action"
								>
									<SelectValue placeholder="All actions" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All actions
									</SelectItem>
									{ACTION_CATEGORIES.map((category) => (
										<SelectItem
											key={category.value}
											value={category.value}
										>
											{category.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				<DataTable
					columns={auditLogColumns}
					data={logs}
					isLoading={isLoading}
					pagination={{
						totalItems: data?.total ?? 0,
						currentPage,
						itemsPerPage: ITEMS_PER_PAGE,
						onPageChange: setCurrentPage,
					}}
					emptyState={
						<div className="rounded-xl border bg-card py-12 text-center text-muted-foreground">
							No audit logs found
						</div>
					}
				/>
			</div>
		</SettingsItem>
	);
}
