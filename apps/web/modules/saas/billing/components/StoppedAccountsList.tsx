"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
import { useServerSorting } from "@shared/hooks/use-server-sorting";
import { displayName } from "@shared/lib/display-name";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Skeleton } from "@ui/components/skeleton";
import { OctagonXIcon, PlayIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useMonthFilter,
	useReactivateAccount,
	useStoppedAccounts,
} from "../hooks/use-billing";
import { BillingCycleSelect } from "./BillingCycleSelect";

const PAGE_SIZE = 25;

const SORT_BY_MAP = {
	customer: "customerName",
	group: "groupName",
	stoppedOn: "paidAt",
} as const satisfies Record<string, "paidAt" | "customerName" | "groupName">;

interface StoppedPaymentRow {
	id: string;
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		plan: { name: string } | null;
		groupName: string | null;
		expiresAt: string | Date | null;
	};
	collector: { name: string };
	paidAt: string | Date;
	noteCategory: string | null;
	notes: string | null;
}

export function StoppedAccountsList() {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [page, setPage] = useState(1);
	const { sorting, sortBy, sortOrder, onSortingChange } = useServerSorting(
		SORT_BY_MAP,
		() => setPage(1),
	);
	const [reactivatePayment, setReactivatePayment] = useState<{
		id: string;
		customerName: string;
		currentExpiry: string | null;
	} | null>(null);
	const { monthFilter, setMonthFilter, options } = useMonthFilter();
	const { activeOrganization } = useActiveOrganization();
	const orgSlug = activeOrganization?.slug ?? "";

	// Extract year/month from the selected billing month option
	const selectedOption = options.find((o) => o.value === monthFilter);
	const filterYear = selectedOption?.year;
	const filterMonth = selectedOption?.month;

	const { payments, total } = useStoppedAccounts({
		year: filterYear,
		month: filterMonth,
		search: debouncedSearch || undefined,
		page,
		sortBy,
		sortOrder,
	});

	const columns = useMemo<ColumnDef<StoppedPaymentRow, unknown>[]>(
		() => [
			{
				id: "customer",
				header: "Customer",
				accessorFn: (row) => row.customer.firstName,
				enableSorting: true,
				cell: ({ row }) => {
					const c = row.original.customer;
					return (
						<>
							<a
								href={`/app/${orgSlug}/customers/${c.id}`}
								className="font-medium hover:underline"
							>
								{displayName(c.firstName, c.lastName)}
							</a>
							<div className="text-xs text-muted-foreground">
								{c.username}
							</div>
						</>
					);
				},
			},
			{
				id: "plan",
				header: "Plan",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.customer.plan?.name ?? "\u2014"}
					</span>
				),
			},
			{
				id: "group",
				header: "Group",
				accessorFn: (row) => row.customer.groupName,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.customer.groupName ?? "\u2014"}
					</span>
				),
			},
			{
				id: "collector",
				header: "Collector",
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.collector.name}
					</span>
				),
			},
			{
				id: "stoppedOn",
				header: "Stopped On",
				accessorFn: (row) => row.paidAt,
				enableSorting: true,
				cell: ({ row }) => (
					<span className="text-sm">
						{new Date(row.original.paidAt).toLocaleDateString(
							"en-GB",
						)}
					</span>
				),
			},
			{
				id: "note",
				header: "Note",
				enableSorting: false,
				meta: {
					className:
						"max-w-28 truncate text-xs text-muted-foreground",
				},
				cell: ({ row }) =>
					row.original.noteCategory ?? row.original.notes ?? "\u2014",
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => (
					<Button
						size="sm"
						variant="outline"
						onClick={() =>
							setReactivatePayment({
								id: row.original.id,
								customerName: displayName(
									row.original.customer.firstName,
									row.original.customer.lastName,
								),
								currentExpiry: row.original.customer.expiresAt
									? (new Date(row.original.customer.expiresAt)
											.toISOString()
											.split("T")[0] ?? null)
									: null,
							})
						}
					>
						<PlayIcon className="mr-1 size-3.5" />
						Reactivate
					</Button>
				),
			},
		],
		[orgSlug],
	);

	return (
		<PageShell
			title="Stopped Accounts"
			description={`${total} stopped accounts`}
		>
			<div className="space-y-4">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search customers..."
						className="sm:max-w-xs"
					/>
					<BillingCycleSelect
						options={options}
						value={monthFilter}
						onValueChange={setMonthFilter}
					/>
				</div>

				<DataTable
					columns={columns}
					data={payments}
					sorting={sorting}
					onSortingChange={onSortingChange}
					pagination={{
						totalItems: total,
						currentPage: page,
						itemsPerPage: PAGE_SIZE,
						onPageChange: setPage,
					}}
					emptyState={
						<EmptyState
							icon={OctagonXIcon}
							title="No stopped accounts"
							description="No stopped accounts found."
						/>
					}
				/>
			</div>

			{reactivatePayment && (
				<ReactivateDialog
					open={!!reactivatePayment}
					onOpenChange={(open) => {
						if (!open) {
							setReactivatePayment(null);
						}
					}}
					paymentId={reactivatePayment.id}
					customerName={reactivatePayment.customerName}
					currentExpiry={reactivatePayment.currentExpiry}
				/>
			)}
		</PageShell>
	);
}

function ReactivateDialog({
	open,
	onOpenChange,
	paymentId,
	customerName,
	currentExpiry,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	paymentId: string;
	customerName: string;
	currentExpiry: string | null;
}) {
	const organizationId = useOrganizationId();
	const reactivate = useReactivateAccount();
	const [customExpiry, setCustomExpiry] = useState(currentExpiry ?? "");
	const [useCustom, setUseCustom] = useState(false);

	function handleReactivate() {
		if (!organizationId) {
			return;
		}

		reactivate.mutate(
			{
				organizationId,
				paymentId,
				customExpiry:
					useCustom && customExpiry
						? new Date(customExpiry).toISOString()
						: undefined,
			},
			{
				onSuccess: () => {
					toast.success("Account reactivated");
					onOpenChange(false);
				},
				onError: (error) => {
					toast.error(error.message);
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Reactivate Account</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<p className="text-sm text-muted-foreground">
						Reactivate <strong>{customerName}</strong>?
					</p>

					<div className="flex gap-2">
						<Button
							variant={useCustom ? "outline" : "secondary"}
							size="sm"
							onClick={() => setUseCustom(false)}
						>
							Same Billing Expiry
						</Button>
						<Button
							variant={useCustom ? "secondary" : "outline"}
							size="sm"
							onClick={() => setUseCustom(true)}
						>
							Custom Billing Expiry
						</Button>
					</div>

					{useCustom && (
						<div>
							<Label htmlFor="customExpiry">
								New Billing Expiry
							</Label>
							<Input
								id="customExpiry"
								type="date"
								value={customExpiry}
								onChange={(e) =>
									setCustomExpiry(e.target.value)
								}
							/>
						</div>
					)}

					<Button
						className="w-full"
						onClick={handleReactivate}
						disabled={reactivate.isPending}
					>
						{reactivate.isPending
							? "Reactivating..."
							: "Reactivate"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

export function StoppedAccountsListSkeleton() {
	return (
		<PageShell title="Stopped Accounts" description="Loading...">
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<div className="rounded-xl border bg-card p-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4 py-3">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-5 w-24" />
							<Skeleton className="ml-auto h-8 w-20" />
						</div>
					))}
				</div>
			</div>
		</PageShell>
	);
}
