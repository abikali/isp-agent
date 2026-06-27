"use client";

import { Pagination } from "@saas/shared/components/Pagination";
import {
	ContentCard,
	ContentCardToolbar,
} from "@shared/components/ContentCard";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { EmptyState } from "@shared/components/EmptyState";
import { formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import {
	CheckIcon,
	PencilIcon,
	PhoneCallIcon,
	PhoneIcon,
	PlusIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useCreateFollowup,
	useFollowups,
	useUpdateFollowup,
} from "../hooks/use-followups";

type Followup = ReturnType<typeof useFollowups>["followups"][number];

const STATUS_OPTIONS = [
	{ value: "new", label: "New" },
	{ value: "stopped", label: "Stopped" },
	{ value: "contacted", label: "Contacted" },
	{ value: "promised", label: "Promised" },
	{ value: "other", label: "Other" },
];

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive followups list (tabs, filters, table, pagination) sharing one query; splitting fragments the data flow
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent filter/pagination state slices; a reducer would not simplify these unrelated values
export function FollowupsList() {
	const organizationId = useOrganizationId();
	const [tab, setTab] = useState<"open" | "done">("open");
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 200 });
	const [statusFilter, setStatusFilter] = useState<string | undefined>();
	const [page, setPage] = useState(1);

	const { followups, total, totalPages } = useFollowups({
		isDone: tab === "done",
		status: statusFilter,
		search: debouncedSearch || undefined,
		page,
	});

	const updateFollowup = useUpdateFollowup();
	const createFollowup = useCreateFollowup();

	const [editing, setEditing] = useState<Followup | null>(null);
	const [editNote, setEditNote] = useState("");
	const [editStatus, setEditStatus] = useState("new");
	const [showCreate, setShowCreate] = useState(false);
	const [createCustomer, setCreateCustomer] = useState<{
		id: string;
		name: string;
		username: string | null;
	} | null>(null);
	const [createNote, setCreateNote] = useState("");

	const columns = useMemo<ColumnDef<Followup, unknown>[]>(
		() => [
			{
				id: "customer",
				header: "Customer",
				cell: ({ row }) => (
					<div>
						<p className="text-sm font-medium">
							{row.original.customerName ?? "—"}
						</p>
						{row.original.customerUsername && (
							<p className="font-mono text-xs text-muted-foreground">
								{row.original.customerUsername}
							</p>
						)}
					</div>
				),
			},
			{
				id: "mobile",
				header: "Mobile",
				cell: ({ row }) =>
					row.original.mobile ? (
						<a
							href={`tel:${row.original.mobile}`}
							className="flex items-center gap-1 text-sm text-primary hover:underline"
						>
							<PhoneIcon className="size-3" />
							{row.original.mobile}
						</a>
					) : (
						<span className="text-muted-foreground">&mdash;</span>
					),
			},
			{
				id: "group",
				header: "Group",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.groupName ?? "—"}
					</span>
				),
			},
			{
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant="outline">
						{row.original.status ?? "new"}
					</Badge>
				),
			},
			{
				id: "note",
				header: "Note",
				enableSorting: false,
				meta: { className: "hidden lg:table-cell" },
				cell: ({ row }) => (
					<div className="max-w-64">
						<p className="line-clamp-1 text-xs text-muted-foreground">
							{row.original.note ?? ""}
						</p>
						{row.original.collectorNote && (
							<p className="line-clamp-1 text-xs text-blue-600 dark:text-blue-400">
								{row.original.collectorNote}
							</p>
						)}
					</div>
				),
			},
			{
				accessorKey: "createdAt",
				header: "Created",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="whitespace-nowrap text-sm tabular-nums">
						{formatDate(row.original.createdAt, {
							dateStyle: "medium",
						})}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				cell: ({ row }) => {
					const followup = row.original;
					return (
						<div className="flex gap-1.5">
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => {
									setEditNote(followup.collectorNote ?? "");
									setEditStatus(followup.status ?? "new");
									setEditing(followup);
								}}
							>
								<PencilIcon className="size-4" />
								<span className="sr-only">Edit</span>
							</Button>
							{!followup.isDone && (
								<Button
									size="sm"
									variant="outline"
									disabled={updateFollowup.isPending}
									onClick={async () => {
										if (!organizationId) {
											return;
										}
										try {
											await updateFollowup.mutateAsync({
												organizationId,
												id: followup.id,
												isDone: true,
											});
											toast.success(
												"Follow-up marked done",
											);
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Failed to update",
											);
										}
									}}
								>
									<CheckIcon className="mr-1 size-3.5" />
									Done
								</Button>
							)}
						</div>
					);
				},
			},
		],
		[organizationId, updateFollowup],
	);

	return (
		<div>
			<ContentCard>
				<ContentCardToolbar>
					<div className="flex w-full flex-wrap items-center justify-between gap-2">
						<Tabs
							value={tab}
							onValueChange={(v) => {
								setTab(v as "open" | "done");
								setPage(1);
							}}
						>
							<TabsList>
								<TabsTrigger value="open">
									Open
									{tab === "open" && total > 0 && (
										<Badge
											variant="info"
											className="ml-1.5"
										>
											{total}
										</Badge>
									)}
								</TabsTrigger>
								<TabsTrigger value="done">Done</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								onClick={() => setShowCreate(true)}
							>
								<PlusIcon className="mr-1.5 size-3.5" />
								New
							</Button>
							<Input
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(1);
								}}
								placeholder="Search name, phone, group..."
								className="w-56"
							/>
							<Select
								value={statusFilter ?? "all"}
								onValueChange={(v) => {
									setStatusFilter(
										v === "all" ? undefined : v,
									);
									setPage(1);
								}}
							>
								<SelectTrigger className="w-36">
									<SelectValue placeholder="All statuses" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										All statuses
									</SelectItem>
									{STATUS_OPTIONS.map((opt) => (
										<SelectItem
											key={opt.value}
											value={opt.value}
										>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</ContentCardToolbar>

				<DataTable
					columns={columns}
					data={followups}
					pageSize={25}
					emptyState={
						<EmptyState
							icon={PhoneCallIcon}
							title={
								tab === "open"
									? "No open follow-ups"
									: "No completed follow-ups"
							}
							description="Follow-ups help you track customers who need a call back."
						/>
					}
				/>

				{totalPages > 1 && (
					<div className="border-t px-4 py-3">
						<Pagination
							currentPage={page}
							totalItems={total}
							itemsPerPage={25}
							onChangeCurrentPage={setPage}
						/>
					</div>
				)}
			</ContentCard>

			{editing && (
				<Dialog
					open={!!editing}
					onOpenChange={(open) => {
						if (!open) {
							setEditing(null);
						}
					}}
				>
					<DialogContent className="sm:max-w-sm">
						<DialogHeader>
							<DialogTitle>
								{editing.customerName ?? "Follow-up"}
							</DialogTitle>
						</DialogHeader>
						<div className="space-y-4">
							<div className="space-y-1.5">
								<Label>Status</Label>
								<Select
									value={editStatus}
									onValueChange={setEditStatus}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{STATUS_OPTIONS.map((opt) => (
											<SelectItem
												key={opt.value}
												value={opt.value}
											>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="fu-note">Collector note</Label>
								<Textarea
									id="fu-note"
									value={editNote}
									onChange={(e) =>
										setEditNote(e.target.value)
									}
									rows={3}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setEditing(null)}
							>
								Cancel
							</Button>
							<Button
								disabled={updateFollowup.isPending}
								onClick={async () => {
									if (!organizationId) {
										return;
									}
									try {
										await updateFollowup.mutateAsync({
											organizationId,
											id: editing.id,
											status: editStatus,
											collectorNote: editNote,
										});
										toast.success("Follow-up updated");
										setEditing(null);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to update",
										);
									}
								}}
							>
								Save
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			<Dialog open={showCreate} onOpenChange={setShowCreate}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>New Follow-up</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label>Customer</Label>
							<CustomerCombobox
								value={createCustomer}
								onChange={setCreateCustomer}
								placeholder="Find a customer…"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="fu-create-note">Note</Label>
							<Textarea
								id="fu-create-note"
								value={createNote}
								onChange={(e) => setCreateNote(e.target.value)}
								rows={3}
								placeholder="Why does this customer need a follow-up?"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowCreate(false)}
						>
							Cancel
						</Button>
						<Button
							disabled={
								createFollowup.isPending || !createCustomer
							}
							onClick={async () => {
								if (!organizationId || !createCustomer) {
									return;
								}
								try {
									await createFollowup.mutateAsync({
										organizationId,
										customerId: createCustomer.id,
										note: createNote || undefined,
									});
									toast.success("Follow-up created");
									setShowCreate(false);
									setCreateCustomer(null);
									setCreateNote("");
								} catch (error) {
									toast.error(
										error instanceof Error
											? error.message
											: "Failed to create",
									);
								}
							}}
						>
							Create
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
