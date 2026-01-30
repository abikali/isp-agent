"use client";

import { SettingsItem } from "@saas/shared/client";
import { Skeleton } from "@ui/components/skeleton";
import { toast } from "sonner";
import { useConnectionsQuery } from "../hooks/use-connections";
import { useNangoConnect } from "../hooks/use-nango-connect";
import { INTEGRATION_PROVIDERS, PROVIDER_CATEGORIES } from "../lib/providers";
import { IntegrationCard } from "./IntegrationCard";

/**
 * Skeleton component for IntegrationsGrid loading state.
 */
export function IntegrationsGridSkeleton() {
	return (
		<SettingsItem
			title="Available Integrations"
			description="Connect your favorite tools to sync contacts"
		>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="rounded-lg border p-4 space-y-3">
						<div className="flex items-center gap-3">
							<Skeleton className="size-10 rounded-lg" />
							<Skeleton className="h-5 w-24" />
						</div>
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				))}
			</div>
		</SettingsItem>
	);
}

interface IntegrationsGridProps {
	organizationId: string;
	onManageConnection?: (connectionId: string) => void;
}

export function IntegrationsGrid({
	organizationId,
	onManageConnection,
}: IntegrationsGridProps) {
	const { data } = useConnectionsQuery(organizationId);
	const connections = data?.connections ?? [];
	const { connect, isConnecting, connectingProvider, isConfigured } =
		useNangoConnect();

	// Create a set of connected provider keys for quick lookup
	const connectedProviders = new Set(
		connections.map((c) => c.providerConfigKey),
	);

	// Get connection by provider key
	const getConnection = (providerKey: string) =>
		connections.find((c) => c.providerConfigKey === providerKey);

	const handleConnect = async (providerKey: string) => {
		if (!isConfigured) {
			toast.error("Integrations are not configured");
			return;
		}

		try {
			await connect(providerKey);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Connection failed";
			if (!message.includes("closed")) {
				toast.error(message);
			}
		}
	};

	const handleManage = (providerKey: string) => {
		const connection = getConnection(providerKey);
		if (connection && onManageConnection) {
			onManageConnection(connection.id);
		}
	};

	// Group providers by category
	const providersByCategory = Object.entries(PROVIDER_CATEGORIES).map(
		([categoryKey, category]) => ({
			...category,
			key: categoryKey,
			providers: INTEGRATION_PROVIDERS.filter(
				(p) => p.category === categoryKey,
			),
		}),
	);

	return (
		<div className="space-y-8">
			{providersByCategory.map(
				(category) =>
					category.providers.length > 0 && (
						<SettingsItem
							key={category.key}
							title={category.label}
							description={category.description}
						>
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{category.providers.map((provider) => (
									<IntegrationCard
										key={provider.key}
										provider={provider}
										isConnected={connectedProviders.has(
											provider.key,
										)}
										isConnecting={
											isConnecting &&
											connectingProvider === provider.key
										}
										onConnect={() =>
											handleConnect(provider.key)
										}
										onManage={() =>
											handleManage(provider.key)
										}
									/>
								))}
							</div>
						</SettingsItem>
					),
			)}
		</div>
	);
}
