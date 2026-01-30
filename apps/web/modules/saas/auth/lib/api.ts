"use client";

import { authClient } from "@repo/auth/client";
import { config } from "@repo/config";
import { useQuery } from "@tanstack/react-query";

// Query key factories for cache invalidation
export const authQueryKeys = {
	all: () => ["user"] as const,
	session: () => [...authQueryKeys.all(), "session"] as const,
	accounts: () => [...authQueryKeys.all(), "accounts"] as const,
	passkeys: () => [...authQueryKeys.all(), "passkeys"] as const,
};

export const useSessionQuery = () => {
	// Only fetch session on client to avoid blocking SSR
	const isClient = typeof window !== "undefined";

	return useQuery({
		queryKey: authQueryKeys.session(),
		queryFn: async () => {
			const { data, error } = await authClient.getSession({
				query: {
					disableCookieCache: true,
				},
			});

			if (error) {
				throw new Error(error.message || "Failed to fetch session");
			}

			return data;
		},
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
		// Disable during SSR to avoid blocking server render
		enabled: config.ui.saas.enabled && isClient,
	});
};

export const useUserAccountsQuery = () => {
	return useQuery({
		queryKey: authQueryKeys.accounts(),
		queryFn: async () => {
			const { data, error } = await authClient.listAccounts();

			if (error) {
				throw error;
			}

			return data;
		},
	});
};

export const useUserPasskeysQuery = () => {
	return useQuery({
		queryKey: authQueryKeys.passkeys(),
		queryFn: async () => {
			const { data, error } = await authClient.passkey.listUserPasskeys();

			if (error) {
				throw error;
			}

			return data;
		},
	});
};
