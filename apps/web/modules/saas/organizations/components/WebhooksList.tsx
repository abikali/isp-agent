"use client";

import { SettingsItem } from "@saas/shared/client";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
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
import { PauseIcon, PlayIcon, TrashIcon } from "lucide-react";
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

export function WebhooksList() {
	const queryClient = useQueryClient();
	const organizationId = useOrganizationId();

	// useSuspenseQuery - requires Suspense boundary
	const { data } = useSuspenseQuery(
		webhooksQueryOptions(organizationId ?? ""),
	);
	const webhooks = data?.webhooks ?? [];

	const deleteMutation = useMutation(orpc.webhooks.delete.mutationOptions());
	const updateMutation = useMutation(orpc.webhooks.update.mutationOptions());
	const testMutation = useMutation(orpc.webhooks.test.mutationOptions());

	const handleDelete = async (id: string) => {
		if (!confirm("Are you sure you want to delete this webhook?")) {
			return;
		}

		try {
			await deleteMutation.mutateAsync({ id });
			queryClient.invalidateQueries({
				queryKey: orpc.webhooks.list.key(),
			});
			toast.success("Webhook deleted successfully");
		} catch {
			toast.error("Failed to delete webhook");
		}
	};

	const handleToggle = async (id: string, enabled: boolean) => {
		try {
			await updateMutation.mutateAsync({ id, enabled });
			queryClient.invalidateQueries({
				queryKey: orpc.webhooks.list.key(),
			});
			toast.success("Webhook updated successfully");
		} catch {
			toast.error("Failed to update webhook");
		}
	};

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

	if (!organizationId) {
		return null;
	}

	return (
		<SettingsItem
			title="Webhooks"
			description="Manage webhook endpoints for your organization"
		>
			{webhooks.length === 0 ? (
				<div className="py-8 text-center text-muted-foreground">
					No webhooks configured
				</div>
			) : (
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Endpoint</TableHead>
								<TableHead>Events</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[120px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{webhooks.map((webhook) => (
								<TableRow key={webhook.id}>
									<TableCell className="font-mono text-sm">
										<span className="max-w-[200px] truncate block">
											{webhook.url}
										</span>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{webhook.events
												.slice(0, 2)
												.map((event) => (
													<Badge
														key={event}
														variant="secondary"
														className="text-xs"
													>
														{event}
													</Badge>
												))}
											{webhook.events.length > 2 && (
												<Badge
													variant="outline"
													className="text-xs"
												>
													+{webhook.events.length - 2}
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell>
										<Badge
											variant={
												webhook.enabled
													? "default"
													: "secondary"
											}
										>
											{webhook.enabled
												? "Enabled"
												: "Disabled"}
										</Badge>
									</TableCell>
									<TableCell>
										<div className="flex gap-1">
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													handleToggle(
														webhook.id,
														!webhook.enabled,
													)
												}
												disabled={
													updateMutation.isPending
												}
												title={
													webhook.enabled
														? "Disable"
														: "Enable"
												}
											>
												{webhook.enabled ? (
													<PauseIcon className="size-4" />
												) : (
													<PlayIcon className="size-4" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													handleDelete(webhook.id)
												}
												disabled={
													deleteMutation.isPending
												}
											>
												<TrashIcon className="size-4 text-destructive" />
											</Button>
										</div>
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
