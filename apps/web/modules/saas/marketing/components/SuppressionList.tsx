"use client";

import { ContentCard } from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { PermissionGate } from "@shared/components/PermissionGate";
import { formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { Textarea } from "@ui/components/textarea";
import { BellOffIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useAddSuppressions,
	useRemoveSuppression,
	useSuppressionsQuery,
} from "../hooks/use-marketing";

interface SuppressionListProps {
	organizationSlug: string;
}

export function SuppressionList({ organizationSlug }: SuppressionListProps) {
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [debouncedSearch] = useDebouncedValue(search, { wait: 250 });
	const { items, total, pageSize, isLoading } = useSuppressionsQuery({
		page,
		search: debouncedSearch,
	});
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return (
		<PageShell
			title="Opt-out list"
			description="Phones on this list never receive marketing broadcasts. They are removed when a broadcast is built and again right before it sends."
			backTo={`/app/${organizationSlug}/marketing`}
			backLabel="Back to broadcasts"
		>
			<PermissionGate resource="marketing" action="send" fallback={null}>
				<AddSuppressionsForm />
			</PermissionGate>

			<ContentCard>
				<div className="flex items-center gap-2 border-b bg-surface-subtle/40 p-3">
					<div className="relative flex-1">
						<SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => {
								setSearch(e.target.value);
								setPage(1);
							}}
							placeholder="Search by phone or reason…"
							className="pl-8"
						/>
					</div>
					<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
						{total.toLocaleString()} opted out
					</span>
				</div>

				{isLoading ? (
					<div className="h-40 animate-pulse bg-muted/20" />
				) : items.length === 0 ? (
					<EmptyState
						icon={BellOffIcon}
						title={
							debouncedSearch
								? "No matches"
								: "Nobody has opted out"
						}
						description={
							debouncedSearch
								? "Try a different phone or reason."
								: "Add a phone when a customer asks to stop receiving offers."
						}
					/>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Phone</TableHead>
								<TableHead>Reason</TableHead>
								<TableHead className="hidden sm:table-cell">
									Added
								</TableHead>
								<TableHead className="w-12" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((item) => (
								<SuppressionRow key={item.id} item={item} />
							))}
						</TableBody>
					</Table>
				)}

				{totalPages > 1 && (
					<div className="flex items-center justify-end gap-2 border-t bg-surface-subtle/40 px-3 py-2.5 text-sm">
						<Button
							variant="outline"
							size="sm"
							disabled={page === 1}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
						>
							Previous
						</Button>
						<span className="text-xs text-muted-foreground">
							Page {page} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages}
							onClick={() =>
								setPage((p) => Math.min(totalPages, p + 1))
							}
						>
							Next
						</Button>
					</div>
				)}
			</ContentCard>
		</PageShell>
	);
}

function AddSuppressionsForm() {
	const organizationId = useOrganizationId();
	const add = useAddSuppressions();
	const [phones, setPhones] = useState("");
	const [reason, setReason] = useState("");

	const entries = phones.split(/[\s,;]+/).filter((p) => p.trim().length > 0);

	const onSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!organizationId || entries.length === 0) {
			return;
		}
		try {
			const result = await add.mutateAsync({
				organizationId,
				phones: entries,
				...(reason.trim() ? { reason: reason.trim() } : {}),
			});
			const parts = [`${result.added} added`];
			if (result.alreadyListed > 0) {
				parts.push(`${result.alreadyListed} already listed`);
			}
			if (result.invalid.length > 0) {
				parts.push(`${result.invalid.length} not a valid phone`);
			}
			toast.success(parts.join(" · "));
			setPhones("");
			setReason("");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not add");
		}
	};

	return (
		<ContentCard>
			<form onSubmit={onSubmit} className="space-y-3 p-4">
				<div className="grid gap-3 sm:grid-cols-[1fr_280px]">
					<Field>
						<FieldLabel htmlFor="suppression-phones">
							Phones
						</FieldLabel>
						<Textarea
							id="suppression-phones"
							rows={3}
							value={phones}
							onChange={(e) => setPhones(e.target.value)}
							placeholder="03 123 456, +961 71 000 000 — one or many, separated by commas, spaces or new lines"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="suppression-reason">
							Reason (optional)
						</FieldLabel>
						<Input
							id="suppression-reason"
							value={reason}
							maxLength={200}
							onChange={(e) => setReason(e.target.value)}
							placeholder="e.g. asked to stop offers"
						/>
					</Field>
				</div>
				<div className="flex justify-end">
					<Button
						type="submit"
						disabled={add.isPending || entries.length === 0}
					>
						<BellOffIcon className="size-4" />
						{add.isPending
							? "Adding…"
							: entries.length > 1
								? `Opt out ${entries.length} phones`
								: "Opt out"}
					</Button>
				</div>
			</form>
		</ContentCard>
	);
}

function SuppressionRow({
	item,
}: {
	item: ReturnType<typeof useSuppressionsQuery>["items"][number];
}) {
	const organizationId = useOrganizationId();
	const remove = useRemoveSuppression();

	const onRemove = async () => {
		if (!organizationId) {
			return;
		}
		try {
			await remove.mutateAsync({
				organizationId,
				suppressionId: item.id,
			});
			toast.success(`+${item.phone} can receive broadcasts again`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Remove failed");
		}
	};

	return (
		<TableRow>
			<TableCell className="font-mono text-sm">+{item.phone}</TableCell>
			<TableCell className="text-sm text-muted-foreground">
				{item.reason ?? "—"}
			</TableCell>
			<TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
				{formatDateTime(item.createdAt)}
			</TableCell>
			<TableCell>
				<PermissionGate
					resource="marketing"
					action="send"
					fallback={null}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={`Remove +${item.phone} from the opt-out list`}
						disabled={remove.isPending}
						onClick={onRemove}
					>
						<Trash2Icon className="size-4" />
					</Button>
				</PermissionGate>
			</TableCell>
		</TableRow>
	);
}
