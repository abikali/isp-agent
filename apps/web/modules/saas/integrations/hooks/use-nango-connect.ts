"use client";

import Nango from "@nangohq/frontend";
import { useOrganizationId } from "@shared/lib/organization";
import { useCallback, useState } from "react";
import {
	useCreateSessionMutation,
	useSaveConnectionMutation,
} from "./use-connections";

// Get optional public key (for cloud) and self-hosted URL from environment
// For self-hosted Nango, only NANGO_HOST is required (uses session-based auth)
const NANGO_PUBLIC_KEY = import.meta.env.VITE_NANGO_PUBLIC_KEY || "";
const NANGO_HOST = import.meta.env.VITE_NANGO_HOST || "";

// Nango is configured if either cloud (public key) or self-hosted (host URL) is set
const IS_NANGO_CONFIGURED = Boolean(NANGO_PUBLIC_KEY || NANGO_HOST);

/**
 * Hook for connecting integrations via Nango OAuth flow.
 */
export function useNangoConnect() {
	const organizationId = useOrganizationId();
	const createSessionMutation = useCreateSessionMutation();
	const saveConnectionMutation = useSaveConnectionMutation();
	const [isConnecting, setIsConnecting] = useState(false);
	const [connectingProvider, setConnectingProvider] = useState<string | null>(
		null,
	);

	const connect = useCallback(
		async (providerConfigKey: string) => {
			if (!organizationId || !IS_NANGO_CONFIGURED) {
				throw new Error("Missing organization or Nango configuration");
			}

			setIsConnecting(true);
			setConnectingProvider(providerConfigKey);

			try {
				// Create a session token from our backend
				const session = await createSessionMutation.mutateAsync({
					organizationId,
					providerConfigKey,
				});

				// Initialize Nango frontend SDK (supports self-hosted)
				const nango = new Nango({
					connectSessionToken: session.sessionToken,
					// Only add host if self-hosting (non-empty string)
					...(NANGO_HOST && { host: NANGO_HOST }),
				});

				// Open OAuth popup and wait for completion
				const result = await nango.auth(providerConfigKey);

				// Save the connection to our database
				await saveConnectionMutation.mutateAsync({
					organizationId,
					providerConfigKey,
					connectionId: result.connectionId,
				});

				return { success: true, connectionId: result.connectionId };
			} catch (error) {
				// User may have closed the popup, or OAuth failed
				const message =
					error instanceof Error
						? error.message
						: "Connection failed";
				throw new Error(message);
			} finally {
				setIsConnecting(false);
				setConnectingProvider(null);
			}
		},
		[organizationId, createSessionMutation, saveConnectionMutation],
	);

	return {
		connect,
		isConnecting,
		connectingProvider,
		isConfigured: IS_NANGO_CONFIGURED,
	};
}
