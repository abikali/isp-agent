"use client";

import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { SearchInput } from "@shared/components/SearchInput";
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
import { useReactivateAccount, useStoppedAccounts } from "../hooks/use-billing";

const PAGE_SIZE = 25;

interface StoppedPaymentRow {
	id: string;
	customer: {
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
	const [reactivatePayment, setReactivatePayment] = useState<{
		id: string;
		customerName: string;
		currentExpiry: string | null;
	} | null>(null);

	const { payments, total } = useStoppedAccounts({
		search: debouncedSearch || undefined,
		page,
	});

	const columns = useMemo<ColumnDef<StoppedPaymentRow, unknown>[]>(
		() => [
			{
				id: "customer",
				header: "Customer",
				enableSorting: false,
				cell: ({ row }) => (
					<>
						<div className="font-medium">
							{displayName(
								row.original.customer.firstName,
								row.original.customer.lastName,
							)}
						</div>
						<div className="text-xs text-muted-foreground">
							{row.original.customer.username}
						</div>
					</>
				),
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
				enableSorting: false,
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
				enableSorting: false,
				cell: ({ row }) => (
					<span className="text-sm">
						{new Date(row.original.paidAt).toLocaleDateString()}
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
		[],
	);

	return (
		<PageShell
			title="Stopped Accounts"
			description={`${total} stopped accounts`}
		>
			<div className="space-y-4">
				<SearchInput
					value={search}
					onChange={setSearch}
					placeholder="Search customers..."
				/>

				<DataTable
					columns={columns}
					data={payments}
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
							Same Expiry
						</Button>
						<Button
							variant={useCustom ? "secondary" : "outline"}
							size="sm"
							onClick={() => setUseCustom(true)}
						>
							Custom Expiry
						</Button>
					</div>

					{useCustom && (
						<div>
							<Label htmlFor="customExpiry">
								New Expiry Date
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
