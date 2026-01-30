"use client";

import { SettingsItem } from "@saas/shared/client";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { TrashIcon } from "lucide-react";
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

export function ApiKeysList() {
	const queryClient = useQueryClient();
	const organizationId = useOrganizationId();

	// useSuspenseQuery - requires Suspense boundary
	const { data } = useSuspenseQuery(
		apiKeysQueryOptions(organizationId ?? ""),
	);
	const apiKeys = data?.apiKeys ?? [];

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

	const formatDate = (date: string | null | undefined) => {
		if (!date) {
			return "Never";
		}
		return new Date(date).toLocaleDateString();
	};

	if (!organizationId) {
		return null;
	}

	return (
		<SettingsItem
			title="API Keys"
			description="Manage API keys for your organization"
		>
			{apiKeys.length === 0 ? (
				<div className="py-8 text-center text-muted-foreground">
					No API keys found
				</div>
			) : (
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Key Prefix</TableHead>
								<TableHead>Last Used</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead className="w-[80px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{apiKeys.map((apiKey) => (
								<TableRow key={apiKey.id}>
									<TableCell className="font-medium">
										{apiKey.name}
									</TableCell>
									<TableCell>
										<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
											{apiKey.keyPrefix}...
										</code>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDate(
											apiKey.lastUsedAt?.toString(),
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{apiKey.expiresAt
											? formatDate(
													apiKey.expiresAt.toString(),
												)
											: "No expiration"}
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											onClick={() =>
												handleRevoke(apiKey.id)
											}
											disabled={revokeMutation.isPending}
										>
											<TrashIcon className="size-4 text-destructive" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</SettingsItem>
	);
}
