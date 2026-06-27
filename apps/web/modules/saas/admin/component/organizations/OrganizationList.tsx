"use client";

import { authClient } from "@repo/auth/client";
import { getAdminPath } from "@saas/admin/lib/links";
import { OrganizationLogo } from "@saas/organizations/client";
import { useConfirmationAlert } from "@saas/shared/client";
import { Spinner } from "@shared/components/Spinner";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { formatDate } from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useLocation } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Skeleton } from "@ui/components/skeleton";
import {
	DatabaseIcon,
	EditIcon,
	HandshakeIcon,
	KeyRoundIcon,
	MoreVerticalIcon,
	PlusIcon,
	PowerIcon,
	ShieldAlertIcon,
	TrashIcon,
	UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { withQuery } from "ufo";
import { CreateOwnerDialog } from "./CreateOwnerDialog";

// Get typed route API without importing the route file (avoids circular deps)
const routeApi = getRouteApi("/_saas/app/_account/admin/organizations/");

export const ADMIN_ORGANIZATIONS_ITEMS_PER_PAGE = 10;

export function OrganizationListSkeleton() {
	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between gap-6">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-10 w-44" />
			</div>
			<Skeleton className="mb-4 h-10 w-full" />
			<div className="rounded-md border">
				<div className="divide-y">
					{Array.from({ length: 5 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center justify-between p-4"
						>
							<div className="flex items-center gap-2">
								<Skeleton className="size-10 rounded-full" />
								<div className="space-y-1">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-20" />
								</div>
							</div>
							<Skeleton className="size-8" />
						</div>
					))}
				</div>
			</div>
		</Card>
	);
}

const ITEMS_PER_PAGE = ADMIN_ORGANIZATIONS_ITEMS_PER_PAGE;

const sortByMap = {
	name: "name",
	createdAt: "createdAt",
	members: "membersCount",
	customers: "customersCount",
} as const;

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive admin table; bulk of the length is the memoized column definitions, splitting them would obscure the table contract
export function OrganizationList() {
	const { confirm } = useConfirmationAlert();
	const queryClient = useQueryClient();

	const searchParams = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const currentPage = searchParams.currentPage;
	const searchTerm = searchParams.query;

	const setCurrentPage = useCallback(
		(value: number) =>
			navigate({ search: (prev) => ({ ...prev, currentPage: value }) }),
		[navigate],
	);
	const setSearchTerm = useCallback(
		(value: string) =>
			navigate({ search: (prev) => ({ ...prev, query: value }) }),
		[navigate],
	);

	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		sortByMap,
		() => setCurrentPage(1),
	);

	const [debouncedSearchTerm] = useDebouncedValue(searchTerm, {
		wait: 300,
		leading: true,
	});

	const location = useLocation();
	const getPathWithBackToParemeter = useCallback(
		(path: string) => {
			const search = new URLSearchParams(location.searchStr);
			return withQuery(path, {
				backTo: `${location.pathname}${search.size ? `?${search.toString()}` : ""}`,
			});
		},
		// react-doctor-disable-next-line react-doctor/no-mutable-in-deps -- `location` is a reactive useLocation() value, not the browser global; these deps are correct
		[location.pathname, location.searchStr],
	);

	const getOrganizationEditPath = useCallback(
		(id: string) => {
			return getPathWithBackToParemeter(
				getAdminPath(`/organizations/${id}`),
			);
		},
		[getPathWithBackToParemeter],
	);

	const { data, isLoading, isFetching } = useQuery(
		orpc.admin.organizations.list.queryOptions({
			input: {
				itemsPerPage: ITEMS_PER_PAGE,
				currentPage,
				searchTerm: debouncedSearchTerm,
				sortBy,
				sortOrder,
			},
		}),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to page 1 only when search changes; setCurrentPage is stable from useCallback
	useEffect(() => {
		setCurrentPage(1);
	}, [debouncedSearchTerm, setCurrentPage]);

	const setIradiusDisabledMutation = useMutation({
		...orpc.admin.organizations.setIradiusDisabled.mutationOptions(),
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: orpc.admin.organizations.list.key(),
			});
			toast.success(
				result.iradiusDisabled
					? "iRadius disabled for this organization"
					: "iRadius enabled for this organization",
			);
		},
		onError: (err) => {
			toast.error(err?.message || "Failed to update iRadius status");
		},
	});

	const deleteOrganization = useCallback(
		async (id: string) => {
			toast.promise(
				async () => {
					const { error } = await authClient.organization.delete({
						organizationId: id,
					});

					if (error) {
						throw error;
					}
				},
				{
					loading: "Deleting organization...",
					success: () => {
						queryClient.invalidateQueries({
							queryKey: orpc.admin.organizations.list.key(),
						});
						return "Organization deleted successfully";
					},
					error: (error: { message?: string }) =>
						error?.message || "Failed to delete organization",
				},
			);
		},
		[queryClient],
	);

	type Organization = NonNullable<typeof data>["organizations"][number];

	const columns: ColumnDef<Organization, unknown>[] = useMemo(
		() => [
			{
				id: "name",
				header: "Organization",
				accessorFn: (row) => row.name,
				enableSorting: true,
				cell: ({
					row: {
						original: { id, name, logo, membersCount },
					},
				}) => (
					<div className="flex items-center gap-3">
						<OrganizationLogo name={name} logoUrl={logo} />
						<div className="leading-tight">
							<Link
								to={getOrganizationEditPath(id)}
								className="block font-medium hover:underline"
							>
								{name}
							</Link>
							<span className="text-xs text-muted-foreground">
								{membersCount}{" "}
								{membersCount === 1 ? "member" : "members"}
							</span>
						</div>
					</div>
				),
			},
			{
				id: "dealer",
				header: "Active Dealer",
				enableSorting: false,
				cell: ({ row }) => {
					const dealer = row.original.activeDealer;
					if (dealer) {
						return (
							<Badge
								variant="outline"
								className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30"
							>
								<HandshakeIcon className="mr-1 size-3" />
								{dealer.name}
							</Badge>
						);
					}
					return (
						<Badge variant="destructive">
							<ShieldAlertIcon className="mr-1 size-3" />
							No dealer
						</Badge>
					);
				},
			},
			{
				id: "iradius",
				header: "iRadius",
				enableSorting: false,
				cell: ({ row }) =>
					row.original.iradiusDisabled ? (
						<Badge
							variant="outline"
							className="text-muted-foreground"
						>
							<DatabaseIcon className="mr-1 size-3" />
							Disabled
						</Badge>
					) : (
						<Badge
							variant="outline"
							className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30"
						>
							<DatabaseIcon className="mr-1 size-3" />
							Enabled
						</Badge>
					),
			},
			{
				id: "customers",
				header: "Customers",
				accessorFn: (row) => row.customersCount,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="tabular-nums text-sm text-muted-foreground">
						{row.original.customersCount}
					</span>
				),
			},
			{
				id: "members",
				header: "Members",
				accessorFn: (row) => row.membersCount,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="tabular-nums text-sm text-muted-foreground">
						{row.original.membersCount}
					</span>
				),
			},
			{
				id: "createdAt",
				header: "Created",
				accessorFn: (row) => row.createdAt,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground">
						{formatDate(row.original.createdAt)}
					</span>
				),
			},
			{
				id: "actions",
				header: "",
				enableSorting: false,
				cell: ({
					row: {
						original: { id, name, slug, iradiusDisabled },
					},
				}) => {
					return (
						<div className="flex flex-row justify-end gap-2">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size="icon" variant="ghost">
										<MoreVerticalIcon className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem asChild>
										<Link
											to={getOrganizationEditPath(id)}
											className="flex items-center"
										>
											<EditIcon className="mr-2 size-4" />
											Edit
										</Link>
									</DropdownMenuItem>
									{slug && (
										<DropdownMenuItem asChild>
											<a
												href={`/app/${slug}`}
												className="flex items-center"
											>
												<UsersIcon className="mr-2 size-4" />
												View as org
											</a>
										</DropdownMenuItem>
									)}
									<DropdownMenuSeparator />
									<CreateOwnerDialog
										organizationId={id}
										organizationName={name}
										trigger={
											<DropdownMenuItem
												onSelect={(e) =>
													e.preventDefault()
												}
											>
												<KeyRoundIcon className="mr-2 size-4" />
												Create owner login
											</DropdownMenuItem>
										}
									/>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() =>
											confirm({
												title: iradiusDisabled
													? "Enable iRadius?"
													: "Disable iRadius?",
												message: iradiusDisabled
													? `Re-enable iRadius integration for "${name}"? Customer changes will start mirroring to iRadius again.`
													: `Disable iRadius integration for "${name}"? All iRadius mirroring (status changes, plan changes, sync, push) will stop. Local data will not be affected.`,
												confirmLabel: iradiusDisabled
													? "Enable"
													: "Disable",
												destructive: !iradiusDisabled,
												onConfirm: () =>
													setIradiusDisabledMutation.mutate(
														{
															id,
															disabled:
																!iradiusDisabled,
														},
													),
											})
										}
									>
										<PowerIcon className="mr-2 size-4" />
										{iradiusDisabled
											? "Enable iRadius"
											: "Disable iRadius"}
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										onClick={() =>
											confirm({
												title: "Delete Organization",
												message:
													"Are you sure you want to delete this organization? This action cannot be undone.",
												confirmLabel: "Delete",
												destructive: true,
												onConfirm: () =>
													deleteOrganization(id),
											})
										}
									>
										<span className="flex items-center text-destructive hover:text-destructive">
											<TrashIcon className="mr-2 size-4" />
											Delete
										</span>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					);
				},
			},
		],
		[
			confirm,
			deleteOrganization,
			getOrganizationEditPath,
			setIradiusDisabledMutation,
		],
	);

	const organizations = useMemo(
		() => data?.organizations ?? [],
		[data?.organizations],
	);

	return (
		<Card className="p-3 sm:p-6">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 className="font-semibold text-2xl">Organizations</h2>

				<Button asChild className="w-full sm:w-auto">
					<Link to={getAdminPath("/organizations/new")}>
						<PlusIcon className="mr-1.5 size-4" />
						Create Organization
					</Link>
				</Button>
			</div>
			<div className="relative mb-4">
				<Input
					type="search"
					placeholder="Search organizations..."
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
					className={isFetching ? "pr-10" : ""}
				/>
				{isFetching && (
					<Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />
				)}
			</div>

			<DataTable
				columns={columns}
				data={organizations}
				isLoading={isLoading}
				isFetching={isFetching}
				sorting={sorting}
				onSortingChange={onSortingChange}
				emptyState={
					<p className="h-24 flex items-center justify-center text-muted-foreground">
						No results.
					</p>
				}
				pagination={
					data?.total && data.total > ITEMS_PER_PAGE
						? {
								totalItems: data.total,
								currentPage,
								itemsPerPage: ITEMS_PER_PAGE,
								onPageChange: setCurrentPage,
							}
						: undefined
				}
			/>
		</Card>
	);
}
