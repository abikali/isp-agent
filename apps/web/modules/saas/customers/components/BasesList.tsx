"use client";

import {
	useActiveOrganization,
	useCanAccess,
} from "@saas/organizations/client";
import { useConfirmationAlert } from "@saas/shared/client";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { FilterBar } from "@shared/components/FilterBar";
import { useOrganizationId } from "@shared/lib/organization";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Building2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type Base, useBases, useDeleteBase } from "../hooks/use-bases";
import { BaseFormDialog } from "./BaseFormDialog";

export function BasesList() {
	const organizationId = useOrganizationId();
	const { bases } = useBases();
	const deleteBase = useDeleteBase();
	const { confirm } = useConfirmationAlert();
	const { isOrganizationAdmin } = useActiveOrganization();
	const canAccess = useCanAccess();
	const canCreate = isOrganizationAdmin || canAccess("bases", "create");
	const canUpdate = isOrganizationAdmin || canAccess("bases", "update");
	const canDelete = isOrganizationAdmin || canAccess("bases", "delete");

	const [search, setSearch] = useState("");
	const [showForm, setShowForm] = useState(false);
	const [editingBase, setEditingBase] = useState<Base | null>(null);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) {
			return bases;
		}
		return bases.filter(
			(b) =>
				b.name.toLowerCase().includes(term) ||
				(b.address?.toLowerCase().includes(term) ?? false),
		);
	}, [bases, search]);

	function openCreate() {
		setEditingBase(null);
		setShowForm(true);
	}

	function openEdit(base: Base) {
		setEditingBase(base);
		setShowForm(true);
	}

	function handleDelete(base: Base) {
		if (!organizationId) {
			return;
		}
		confirm({
			title: "Delete base?",
			message: `This permanently deletes "${base.name}" and removes its worker assignments.`,
			confirmLabel: "Delete",
			destructive: true,
			onConfirm: async () => {
				try {
					await deleteBase.mutateAsync({
						organizationId,
						id: base.id,
					});
					toast.success("Base deleted");
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to delete base",
					);
				}
			},
		});
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: openEdit/handleDelete are recreated each render; columns intentionally rebuild only on permission change.
	const columns = useMemo<ColumnDef<Base, unknown>[]>(
		() => [
			{
				accessorKey: "name",
				header: "Base",
				cell: ({ row }) => (
					<p className="font-medium">{row.original.name}</p>
				),
			},
			{
				id: "address",
				header: "Address",
				enableSorting: false,
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) =>
					row.original.address ? (
						<span className="text-sm">{row.original.address}</span>
					) : (
						<span className="text-muted-foreground">&mdash;</span>
					),
			},
			{
				id: "workers",
				header: "Workers",
				enableSorting: false,
				cell: ({ row }) => {
					const workers = row.original.workers;
					if (workers.length === 0) {
						return (
							<span className="text-muted-foreground">
								&mdash;
							</span>
						);
					}
					return (
						<div className="flex flex-wrap items-center gap-1">
							{workers.slice(0, 2).map((w) => (
								<Badge
									key={w.id}
									variant="secondary"
									className="font-normal"
								>
									{w.name}
								</Badge>
							))}
							{workers.length > 2 && (
								<Badge
									variant="secondary"
									className="text-[10px] px-1.5 py-0"
								>
									+{workers.length - 2}
								</Badge>
							)}
						</div>
					);
				},
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-20 text-right" },
				cell: ({ row }) => (
					<div className="flex justify-end gap-1">
						{canUpdate && (
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => openEdit(row.original)}
								aria-label="Edit base"
							>
								<PencilIcon className="size-4" />
							</Button>
						)}
						{canDelete && (
							<Button
								variant="ghost"
								size="icon"
								className="size-8 text-destructive hover:text-destructive"
								onClick={() => handleDelete(row.original)}
								aria-label="Delete base"
							>
								<Trash2Icon className="size-4" />
							</Button>
						)}
					</div>
				),
			},
		],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[canUpdate, canDelete],
	);

	return (
		<ContentCard>
			<ContentCardToolbar
				actions={
					canCreate ? (
						<Button size="sm" onClick={openCreate}>
							<PlusIcon className="mr-1.5 size-4" />
							New base
						</Button>
					) : undefined
				}
			>
				<FilterBar
					bare
					searchPlaceholder="Search by name or address…"
					searchValue={search}
					onSearchChange={setSearch}
				/>
			</ContentCardToolbar>

			<DataTable
				columns={columns}
				data={filtered}
				pageSize={15}
				emptyState={
					<EmptyState
						icon={Building2Icon}
						title={
							bases.length === 0
								? "No bases yet"
								: "No results found"
						}
						description={
							bases.length === 0
								? "Create your first base and assign workers to it."
								: "Try adjusting your search."
						}
						action={
							bases.length === 0 && canCreate ? (
								<Button onClick={openCreate}>
									<PlusIcon className="mr-2 size-4" />
									New base
								</Button>
							) : undefined
						}
					/>
				}
			/>

			{showForm && (
				<BaseFormDialog
					open
					onOpenChange={(o) => {
						if (!o) {
							setShowForm(false);
						}
					}}
					base={editingBase}
				/>
			)}
		</ContentCard>
	);
}
