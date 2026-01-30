"use client";

import { authClient } from "@repo/auth/client";
import { Pagination, useConfirmationAlert } from "@saas/shared/client";
import { Spinner } from "@shared/components/Spinner";
import { UserAvatar } from "@shared/components/UserAvatar";
import { orpc } from "@shared/lib/orpc";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
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
import {
	MoreVerticalIcon,
	Repeat1Icon,
	ShieldCheckIcon,
	ShieldXIcon,
	SquareUserRoundIcon,
	TrashIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { EmailVerified } from "../EmailVerified";

// Get typed route API without importing the route file (avoids circular deps)
const routeApi = getRouteApi("/_saas/app/_account/admin/users");

export const ADMIN_USERS_ITEMS_PER_PAGE = 10;

/**
 * Loading skeleton for the user list.
 * Used as Suspense fallback when data is being fetched.
 */
export function UserListSkeleton() {
	return (
		<Card className="p-6">
			<Skeleton className="mb-4 h-8 w-24" />
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
									<Skeleton className="h-3 w-48" />
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

const ITEMS_PER_PAGE = ADMIN_USERS_ITEMS_PER_PAGE;

export function UserList() {
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();

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

	const { data, isLoading, isFetching, refetch } = useQuery(
		orpc.admin.users.list.queryOptions({
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

	const impersonateUser = useCallback(
		async (userId: string, { name }: { name: string }) => {
			const toastId = toast.loading(`Impersonating ${name}...`);

			await authClient.admin.impersonateUser({
				userId,
			});
			await refetch();
			toast.dismiss(toastId);
			window.location.href = new URL(
				"/app",
				window.location.origin,
			).toString();
		},
		[refetch],
	);

	const deleteUser = useCallback(async (id: string) => {
		toast.promise(
			async () => {
				const { error } = await authClient.admin.removeUser({
					userId: id,
				});

				if (error) {
					throw error;
				}
			},
			{
				loading: "Deleting user...",
				success: () => {
					return "User deleted successfully";
				},
				error: (error: { message?: string }) =>
					error?.message || "Failed to delete user",
			},
		);
	}, []);

	const resendVerificationMail = useCallback(async (email: string) => {
		toast.promise(
			async () => {
				const { error } = await authClient.sendVerificationEmail({
					email,
				});

				if (error) {
					throw error;
				}
			},
			{
				loading: "Sending verification email...",
				success: () => {
					return "Verification email sent successfully";
				},
				error: (error: { message?: string }) =>
					error?.message || "Failed to send verification email",
			},
		);
	}, []);

	const assignAdminRole = useCallback(
		async (id: string) => {
			await authClient.admin.setRole({
				userId: id,
				role: "admin",
			});

			await queryClient.invalidateQueries({
				queryKey: orpc.admin.users.list.key(),
			});
		},
		[queryClient],
	);

	const removeAdminRole = useCallback(
		async (id: string) => {
			await authClient.admin.setRole({
				userId: id,
				role: "user",
			});

			await queryClient.invalidateQueries({
				queryKey: orpc.admin.users.list.key(),
			});
		},
		[queryClient],
	);

	type User = NonNullable<typeof data>["users"][number];
	const columns: ColumnDef<User>[] = useMemo(
		() => [
			{
				accessorKey: "user",
				header: "",
				accessorFn: (row) => row.name,
				cell: ({ row }) => (
					<div className="flex items-center gap-2">
						<UserAvatar
							name={row.original.name ?? row.original.email}
							avatarUrl={row.original.image}
						/>
						<div className="leading-tight">
							<strong className="block">
								{row.original.name ?? row.original.email}
							</strong>
							<small className="flex items-center gap-1 text-foreground/60">
								<span className="block">
									{!!row.original.name && row.original.email}
								</span>
								<EmailVerified
									verified={row.original.emailVerified}
								/>
								<strong className="block">
									{row.original.role === "admin"
										? "Admin"
										: ""}
								</strong>
							</small>
						</div>
					</div>
				),
			},
			{
				accessorKey: "actions",
				header: "",
				cell: ({ row }) => {
					return (
						<div className="flex flex-row justify-end gap-2">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button size="icon" variant="ghost">
										<MoreVerticalIcon className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									<DropdownMenuItem
										onClick={() =>
											impersonateUser(row.original.id, {
												name: row.original.name ?? "",
											})
										}
									>
										<SquareUserRoundIcon className="mr-2 size-4" />
										Impersonate User
									</DropdownMenuItem>

									{!row.original.emailVerified && (
										<DropdownMenuItem
											onClick={() =>
												resendVerificationMail(
													row.original.email,
												)
											}
										>
											<Repeat1Icon className="mr-2 size-4" />
											Resend Verification Email
										</DropdownMenuItem>
									)}

									{row.original.role !== "admin" ? (
										<DropdownMenuItem
											onClick={() =>
												assignAdminRole(row.original.id)
											}
										>
											<ShieldCheckIcon className="mr-2 size-4" />
											Assign Admin Role
										</DropdownMenuItem>
									) : (
										<DropdownMenuItem
											onClick={() =>
												removeAdminRole(row.original.id)
											}
										>
											<ShieldXIcon className="mr-2 size-4" />
											Remove Admin Role
										</DropdownMenuItem>
									)}

									<DropdownMenuItem
										onClick={() =>
											confirm({
												title: "Delete User",
												message:
													"Are you sure you want to delete this user? This action cannot be undone.",
												confirmLabel: "Delete",
												destructive: true,
												onConfirm: () =>
													deleteUser(row.original.id),
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
			impersonateUser,
			deleteUser,
			resendVerificationMail,
			assignAdminRole,
			removeAdminRole,
		],
	);

	const users = useMemo(() => data?.users ?? [], [data?.users]);

	const table = useReactTable({
		data: users,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		manualPagination: true,
	});

	return (
		<Card className="p-6">
			<h2 className="mb-4 font-semibold text-2xl">Users</h2>
			<div className="relative mb-4">
				<Input
					type="search"
					placeholder="Search users..."
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

			{data?.total && data.total > ITEMS_PER_PAGE && (
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
