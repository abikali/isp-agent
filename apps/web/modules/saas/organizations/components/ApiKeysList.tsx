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
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Skeleton } from "@ui/components/skeleton";
import { TrashIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { apiKeysQueryOptions } from "../hooks/use-api-keys";

/**
 * Skeleton component for ApiKeysList loading state.
 */
export function ApiKeysListSkeleton() {
	return (
		<SettingsItem
			title="API Keys"
			description="Manage API keys for your organization"
		>
			<div className="space-y-3">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center justify-between gap-4"
					>
						<div className="flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-24" />
						</div>
						<Skeleton className="h-4 w-20" />
						<Skeleton className="h-4 w-20" />
						<Skeleton className="size-8" />
					</div>
				))}
			</div>
		</SettingsItem>
	);
}

interface ApiKey {
	id: string;
	name: string;
	keyPrefix: string;
	lastUsedAt: Date | string | null;
	expiresAt: Date | string | null;
}

const formatDate = (date: string | null | undefined) => {
	if (!date) {
		return "Never";
	}
	return new Date(date).toLocaleDateString("en-GB");
};

export function ApiKeysList() {
	const queryClient = useQueryClient();
	const organizationId = useOrganizationId();

	// useSuspenseQuery - requires Suspense boundary
	const { data } = useSuspenseQuery(
		apiKeysQueryOptions(organizationId ?? ""),
	);
	const apiKeys = (data?.apiKeys ?? []) as ApiKey[];

	const revokeMutation = useMutation(orpc.apiKeys.revoke.mutationOptions());

	const handleRevoke = async (id: string) => {
		if (!confirm("Are you sure you want to revoke this API key?")) {
			return;
		}

		try {
			await revokeMutation.mutateAsync({ id });
			queryClient.invalidateQueries({
				queryKey: orpc.apiKeys.list.key(),
			});
			toast.success("API key revoked successfully");
		} catch {
			toast.error("Failed to revoke API key");
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: handleRevoke is stable enough via isPending
	const columns: ColumnDef<ApiKey, unknown>[] = useMemo(
		() => [
			{
				accessorKey: "name",
				header: "Name",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.name}</span>
				),
			},
			{
				accessorKey: "keyPrefix",
				header: "Key Prefix",
				cell: ({ row }) => (
					<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
						{row.original.keyPrefix}...
					</code>
				),
			},
			{
				accessorKey: "lastUsedAt",
				header: "Last Used",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{formatDate(row.original.lastUsedAt?.toString())}
					</span>
				),
			},
			{
				accessorKey: "expiresAt",
				header: "Expires",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="text-muted-foreground">
						{row.original.expiresAt
							? formatDate(row.original.expiresAt.toString())
							: "No expiration"}
					</span>
				),
			},
			{
				id: "actions",
				enableSorting: false,
				meta: { className: "w-[80px]" },
				cell: ({ row }) => (
					<Button
						variant="ghost"
						size="icon"
						onClick={() => handleRevoke(row.original.id)}
						disabled={revokeMutation.isPending}
					>
						<TrashIcon className="size-4 text-destructive" />
					</Button>
				),
			},
		],
		[revokeMutation.isPending],
	);

	if (!organizationId) {
		return null;
	}

	return (
		<SettingsItem
			title="API Keys"
			description="Manage API keys for your organization"
		>
			<DataTable
				columns={columns}
				data={apiKeys}
				emptyState={
					<div className="py-8 text-center text-muted-foreground">
						No API keys found
					</div>
				}
			/>
		</SettingsItem>
	);
}
