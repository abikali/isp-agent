"use client";

import { Pagination, SettingsItem } from "@saas/shared/client";
import { Spinner } from "@shared/components/Spinner";
import { UserAvatar } from "@shared/components/UserAvatar";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { format } from "date-fns";
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
									className="w-[180px]"
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

				{/* Table */}
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="min-w-[180px]">
									User
								</TableHead>
								<TableHead className="min-w-[120px]">
									Action
								</TableHead>
								<TableHead className="min-w-[120px]">
									Resource
								</TableHead>
								<TableHead className="min-w-[120px]">
									Timestamp
								</TableHead>
								<TableHead className="min-w-[100px]">
									IP Address
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell
										colSpan={5}
										className="h-24 text-center"
									>
										<div className="flex items-center justify-center">
											<Spinner className="mr-2 size-4 text-primary" />
											Loading...
										</div>
									</TableCell>
								</TableRow>
							) : logs.length > 0 ? (
								logs.map((log) => (
									<TableRow key={log.id}>
										<TableCell>
											{log.user ? (
												<div className="flex items-center gap-2">
													<UserAvatar
														name={
															log.user.name ??
															log.user.email
														}
														avatarUrl={
															log.user.image
														}
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
											) : (
												<span className="text-muted-foreground text-sm">
													System
												</span>
											)}
										</TableCell>
										<TableCell>
											<Badge
												variant={getActionBadgeVariant(
													log.action,
												)}
												className="whitespace-nowrap text-xs"
											>
												{formatActionLabel(log.action)}
											</Badge>
										</TableCell>
										<TableCell>
											<div>
												<span className="block text-muted-foreground text-sm capitalize">
													{log.resourceType}
												</span>
												{log.resourceId && (
													<span className="block font-mono text-muted-foreground/70 text-xs">
														{log.resourceId.slice(
															0,
															8,
														)}
														...
													</span>
												)}
											</div>
										</TableCell>
										<TableCell>
											<span className="whitespace-nowrap text-muted-foreground text-sm">
												{format(
													new Date(log.createdAt),
													"MMM d, HH:mm",
												)}
											</span>
										</TableCell>
										<TableCell>
											<span className="font-mono text-muted-foreground text-xs">
												{log.ipAddress ?? "-"}
											</span>
										</TableCell>
									</TableRow>
								))
							) : (
								<TableRow>
									<TableCell
										colSpan={5}
										className="h-24 text-center"
									>
										<p className="text-muted-foreground">
											No audit logs found
										</p>
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>

				{/* Pagination */}
				{data?.total && data.total > ITEMS_PER_PAGE && (
					<Pagination
						className="mt-4"
						totalItems={data.total}
						itemsPerPage={ITEMS_PER_PAGE}
						currentPage={currentPage}
						onChangeCurrentPage={setCurrentPage}
					/>
				)}
			</div>
		</SettingsItem>
	);
}
