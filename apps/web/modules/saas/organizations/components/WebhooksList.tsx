"use client";

import { SettingsItem } from "@saas/shared/client";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Skeleton } from "@ui/components/skeleton";
import { PauseIcon, PlayIcon, TrashIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { webhooksQueryOptions } from "../hooks/use-webhooks";

/**
 * Skeleton component for WebhooksList loading state.
 */
export function WebhooksListSkeleton() {
	return (
		<SettingsItem
			title="Webhooks"
			description="Manage webhook endpoints for your organization"
		>
			<div className="space-y-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center justify-between gap-4"
					>
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-3 w-24" />
						</div>
						<Skeleton className="h-6 w-16 rounded-full" />
						<Skeleton className="size-8" />
					</div>
				))}
			</div>
		</SettingsItem>
	);
}

interface Webhook {
	id: string;
	url: string;
	events: string[];
	enabled: boolean;
}

export function WebhooksList() {
	const queryClient = useQueryClient();
	const organizationId = useOrganizationId();

	// useSuspenseQuery - requires Suspense boundary
	const { data } = useSuspenseQuery(
		webhooksQueryOptions(organizationId ?? ""),
	);
	const webhooks = (data?.webhooks ?? []) as Webhook[];

	const deleteMutation = useMutation(orpc.webhooks.delete.mutationOptions());
	const updateMutation = useMutation(orpc.webhooks.update.mutationOptions());
	const testMutation = useMutation(orpc.webhooks.test.mutationOptions());
	const { mutateAsync: deleteWebhook } = deleteMutation;
	const { mutateAsync: updateWebhook } = updateMutation;

	const handleDelete = useCallback(
		async (id: string) => {
			if (!confirm("Are you sure you want to delete this webhook?")) {
				return;
			}

			try {
				await deleteWebhook({ id });
				queryClient.invalidateQueries({
					queryKey: orpc.webhooks.list.key(),
				});
				toast.success("Webhook deleted successfully");
			} catch {
				toast.error("Failed to delete webhook");
			}
		},
		[deleteWebhook, queryClient],
	);

	const handleToggle = useCallback(
		async (id: string, enabled: boolean) => {
			try {
				await updateWebhook({ id, enabled });
				queryClient.invalidateQueries({
					queryKey: orpc.webhooks.list.key(),
				});
				toast.success("Webhook updated successfully");
			} catch {
				toast.error("Failed to update webhook");
			}
		},
		[updateWebhook, queryClient],
	);

	const _handleTest = async (id: string) => {
		try {
			const result = await testMutation.mutateAsync({ id });
			if (result.success) {
				toast.success("Test webhook sent successfully");
			} else {
				toast.error(
					`Test webhook failed: ${result.error ?? "Unknown error"}`,
				);
			}
		} catch {
			toast.error("Failed to test webhook");
		}
	};

	const columns: ColumnDef<Webhook, unknown>[] = useMemo(
		() => [
			{
				accessorKey: "url",
				header: "Endpoint",
				cell: ({ row }) => (
					<span className="max-w-[150px] sm:max-w-[200px] truncate block font-mono text-sm">
						{row.original.url}
					</span>
				),
			},
			{
				accessorKey: "events",
				header: "Events",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<div className="flex flex-wrap gap-1">
						{row.original.events.slice(0, 2).map((event) => (
							<Badge
								key={event}
								variant="secondary"
								className="text-xs"
							>
								{event}
							</Badge>
						))}
						{row.original.events.length > 2 && (
							<Badge variant="outline" className="text-xs">
								+{row.original.events.length - 2}
							</Badge>
						)}
					</div>
				),
			},
			{
				accessorKey: "enabled",
				header: "Status",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<Badge
						variant={row.original.enabled ? "default" : "secondary"}
					>
						{row.original.enabled ? "Enabled" : "Disabled"}
					</Badge>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-[120px]" },
				cell: ({ row }) => (
					<div className="flex gap-1">
						<Button
							variant="ghost"
							size="icon"
							onClick={() =>
								handleToggle(
									row.original.id,
									!row.original.enabled,
								)
							}
							disabled={updateMutation.isPending}
							title={row.original.enabled ? "Disable" : "Enable"}
						>
							{row.original.enabled ? (
								<PauseIcon className="size-4" />
							) : (
								<PlayIcon className="size-4" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => handleDelete(row.original.id)}
							disabled={deleteMutation.isPending}
						>
							<TrashIcon className="size-4 text-destructive" />
						</Button>
					</div>
				),
			},
		],
		[
			handleToggle,
			handleDelete,
			updateMutation.isPending,
			deleteMutation.isPending,
		],
	);

	if (!organizationId) {
		return null;
	}

	return (
		<SettingsItem
			title="Webhooks"
			description="Manage webhook endpoints for your organization"
		>
			<DataTable
				columns={columns}
				data={webhooks}
				emptyState={
					<div className="py-8 text-center text-muted-foreground">
						No webhooks configured
					</div>
				}
			/>
		</SettingsItem>
	);
}
