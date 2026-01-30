"use client";

import { authClient } from "@repo/auth/client";
import { getAdminPath } from "@saas/admin/lib/links";
import { OrganizationLogo } from "@saas/organizations/client";
import { Pagination, useConfirmationAlert } from "@saas/shared/client";
import { Spinner } from "@shared/components/Spinner";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, Link, useLocation } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Skeleton } from "@ui/components/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@ui/components/table";
import { EditIcon, MoreVerticalIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { withQuery } from "ufo";

// Get typed route API without importing the route file (avoids circular deps)
const routeApi = getRouteApi("/_saas/app/_account/admin/organizations/");

export const ADMIN_ORGANIZATIONS_ITEMS_PER_PAGE = 10;

/**
 * Loading skeleton for the organization list.
 * Used as Suspense fallback when data is being fetched.
 */
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

export function OrganizationList() {
	const { confirm } = useConfirmationAlert();
	const queryClient = useQueryClient();

	// URL state for filters with TanStack Router
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

	// Use TanStack Pacer for debouncing - handles sync automatically
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
			},
		}),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset to page 1 only when search changes, setCurrentPage is stable from useCallback
	useEffect(() => {
		setCurrentPage(1);
	}, [debouncedSearchTerm]);

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

	const columns: ColumnDef<
		NonNullable<typeof data>["organizations"][number]
	>[] = useMemo(
		() => [
			{
				accessorKey: "user",
				header: "",
				accessorFn: (row) => row.name,
				cell: ({
					row: {
						original: { id, name, logo, membersCount },
					},
				}) => (
					<div className="flex items-center gap-2">
						<OrganizationLogo name={name} logoUrl={logo} />
						<div className="leading-tight">
							<Link
								to={getOrganizationEditPath(id)}
								className="block font-bold"
							>
								{name}
							</Link>
							<small>
								{membersCount}{" "}
								{membersCount === 1 ? "member" : "members"}
							</small>
						</div>
					</div>
				),
			},
			{
				accessorKey: "actions",
				header: "",
				cell: ({
					row: {
						original: { id },
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
								<DropdownMenuContent>
									<DropdownMenuItem asChild>
										<Link
											to={getOrganizationEditPath(id)}
											className="flex items-center"
										>
											<EditIcon className="mr-2 size-4" />
											Edit
										</Link>
									</DropdownMenuItem>
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
		[confirm, deleteOrganization, getOrganizationEditPath],
	);

	const organizations = useMemo(
		() => data?.organizations ?? [],
		[data?.organizations],
	);

	const table = useReactTable({
		data: organizations,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		manualPagination: true,
	});

	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between gap-6">
				<h2 className="font-semibold text-2xl">Organizations</h2>

				<Button asChild>
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

			<div className="rounded-md border">
				<Table>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={
										row.getIsSelected() && "selected"
									}
									className="group"
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											className="py-2 group-first:rounded-t-md group-last:rounded-b-md"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center"
								>
									{isLoading ? (
										<div className="flex h-full items-center justify-center">
											<Spinner className="mr-2 size-4 text-primary" />
											Loading...
										</div>
									) : (
										<p>No results.</p>
									)}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{!!data?.total && data.total > ITEMS_PER_PAGE && (
				<Pagination
					className="mt-4"
					totalItems={data.total}
					itemsPerPage={ITEMS_PER_PAGE}
					currentPage={currentPage}
					onChangeCurrentPage={setCurrentPage}
				/>
			)}
		</Card>
	);
}
