"use client";

import { ContentCard } from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { PhoneActions } from "@shared/components/PhoneActions";
import { formatDate, MEDIUM_DATE_FORMAT } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Label } from "@ui/components/label";
import { Switch } from "@ui/components/switch";
import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	EditIcon,
	HistoryIcon,
	MoreHorizontalIcon,
	PlusIcon,
	TruckIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useArchiveSupplier, useSuppliersQuery } from "../hooks/use-stock";
import { SupplierDialog } from "./SupplierDialog";

type SupplierRow = ReturnType<typeof useSuppliersQuery>["suppliers"][number];

function phoneNumbers(phones: unknown): string[] {
	return Array.isArray(phones)
		? phones
				.map((p: { number?: unknown }) => p?.number)
				.filter((n): n is string => typeof n === "string" && n !== "")
		: [];
}

/**
 * Who the org buys stock from: contact numbers, how many items and
 * deliveries each supplier has, and when the last delivery came in. The name
 * opens the stock log filtered to that supplier's deliveries.
 */
export function SuppliersList({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const [showArchived, setShowArchived] = useState(false);
	const { suppliers, isLoading } = useSuppliersQuery({
		includeArchived: showArchived,
	});
	const archive = useArchiveSupplier();
	const [editing, setEditing] = useState<SupplierRow | "new" | null>(null);

	const columns = useMemo<ColumnDef<SupplierRow, unknown>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Supplier",
				cell: ({ row }) => (
					<div className="min-w-0">
						<Link
							to="/app/$organizationSlug/stock/log"
							params={{ organizationSlug }}
							search={{ supplierId: row.original.id }}
							className="font-medium text-sm hover:underline"
						>
							{row.original.name}
						</Link>
						{row.original.archivedAt && (
							<Badge variant="outline" className="ml-2">
								Archived
							</Badge>
						)}
						{row.original.notes && (
							<p className="line-clamp-2 text-muted-foreground text-xs">
								{row.original.notes}
							</p>
						)}
					</div>
				),
			},
			{
				id: "phones",
				header: "Contact",
				cell: ({ row }) => {
					const numbers = phoneNumbers(row.original.phones);
					return numbers.length > 0 ? (
						<div className="flex max-w-56 flex-wrap gap-2">
							<PhoneActions numbers={numbers} />
						</div>
					) : (
						<span className="text-muted-foreground text-sm">—</span>
					);
				},
			},
			{
				id: "items",
				header: "Items",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums">
						{row.original._count.items}
					</span>
				),
			},
			{
				id: "deliveries",
				header: "Deliveries",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums">
						{row.original._count.logs}
					</span>
				),
			},
			{
				id: "lastDelivery",
				header: "Last delivery",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => {
					const last = row.original.logs[0]?.createdAt;
					return (
						<span className="whitespace-nowrap text-muted-foreground text-sm">
							{last ? formatDate(last, MEDIUM_DATE_FORMAT) : "—"}
						</span>
					);
				},
			},
			{
				id: "actions",
				header: "",
				meta: { className: "w-10" },
				cell: ({ row }) => {
					const supplier = row.original;
					return (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									aria-label="Supplier actions"
								>
									<MoreHorizontalIcon className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem asChild>
									<Link
										to="/app/$organizationSlug/stock/log"
										params={{ organizationSlug }}
										search={{ supplierId: supplier.id }}
									>
										<HistoryIcon className="mr-2 size-3.5" />
										Deliveries
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() => setEditing(supplier)}
								>
									<EditIcon className="mr-2 size-3.5" />
									Edit
								</DropdownMenuItem>
								<PermissionGate
									resource="inventory"
									action="delete"
								>
									<DropdownMenuItem
										onSelect={() => {
											if (!organizationId) {
												return;
											}
											const archived =
												!supplier.archivedAt;
											archive.mutate(
												{
													organizationId,
													id: supplier.id,
													archived,
												},
												{
													onSuccess: () =>
														toast.success(
															archived
																? `${supplier.name} archived`
																: `${supplier.name} restored`,
														),
													onError: (error) =>
														toast.error(
															error.message,
														),
												},
											);
										}}
									>
										{supplier.archivedAt ? (
											<ArchiveRestoreIcon className="mr-2 size-3.5" />
										) : (
											<ArchiveIcon className="mr-2 size-3.5" />
										)}
										{supplier.archivedAt
											? "Restore"
											: "Archive"}
									</DropdownMenuItem>
								</PermissionGate>
							</DropdownMenuContent>
						</DropdownMenu>
					);
				},
			},
		],
		[archive, organizationId, organizationSlug],
	);

	return (
		<PageShell
			title="Suppliers"
			description="Who you buy stock from. Each delivery added on the Stock page records its supplier."
			backTo={`/app/${organizationSlug}/stock`}
			backLabel="Stock"
			actions={
				<PermissionGate resource="inventory" action="create">
					<Button onClick={() => setEditing("new")}>
						<PlusIcon className="mr-2 size-4" />
						New supplier
					</Button>
				</PermissionGate>
			}
		>
			<ContentCard>
				<div className="flex items-center justify-end gap-2 border-b px-4 py-2">
					<Switch
						id="show-archived-suppliers"
						checked={showArchived}
						onCheckedChange={setShowArchived}
					/>
					<Label
						htmlFor="show-archived-suppliers"
						className="font-normal text-sm"
					>
						Show archived
					</Label>
				</div>
				<DataTable
					columns={columns}
					data={suppliers}
					isLoading={isLoading}
					emptyState={
						<EmptyState
							icon={TruckIcon}
							title="No suppliers yet"
							description="Add the shops and distributors you buy stock from."
						/>
					}
				/>
			</ContentCard>

			{editing !== null && (
				<SupplierDialog
					supplier={editing === "new" ? null : editing}
					onClose={() => setEditing(null)}
				/>
			)}
		</PageShell>
	);
}
