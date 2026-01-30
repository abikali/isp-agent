import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ApiRouter, ApiRouterClient } from "@repo/api/orpc/router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

// Server-side module cache - populated only on server via dynamic import
let serverModule: { router: ApiRouter } | null = null;

// Synchronous server router getter that uses cached module
// Must be called after initServerRouter() has completed
function getServerRouter() {
	if (!serverModule) {
		throw new Error(
			"Server router not initialized. Call initServerRouter() first.",
		);
	}
	return serverModule.router;
}

// Initialize server module - called once at startup
// Uses top-level await which is supported in ESM
if (import.meta.env.SSR) {
	serverModule = await import("@repo/api/orpc/router");
}

/**
 * Isomorphic oRPC client
 *
 * - Server: Direct router access (no HTTP overhead) with request headers forwarded
 * - Client: HTTP calls via RPCLink with credentials included
 *
 * @example
 * ```ts
 * // In a route loader (server-side)
 * const loader = createServerFn({ method: "GET" }).handler(async () => {
 *   const keys = await orpcClient.apiKeys.list({ organizationId: "..." });
 *   return keys;
 * });
 *
 * // In a client component
 * const query = useQuery(orpc.apiKeys.list.queryOptions({ input: { organizationId } }));
 * ```
 */
const getOrpcClient = createIsomorphicFn()
	.server(
		() =>
			createRouterClient(getServerRouter(), {
				context: async () => ({
					headers: getRequestHeaders(),
				}),
			}) as ApiRouterClient,
	)
	.client(() => {
		const clientLink = new RPCLink({
			// Lazy URL function - ensures compatibility with SSR environments
			// and provides absolute URL required for path parameter resolution
			url: () => {
				if (typeof window === "undefined") {
					throw new Error(
						"RPCLink is not allowed on the server side.",
					);
				}
				return `${window.location.origin}/api/rpc`;
			},
			fetch: (input, init) =>
				fetch(input, {
					...init,
					credentials: "include",
				}),
		});
		return createORPCClient(clientLink) as ApiRouterClient;
	});

export const orpcClient: ApiRouterClient = getOrpcClient();

/**
 * TanStack Query utilities for oRPC
 * Provides queryOptions, mutationOptions, infiniteOptions, and queryKey helpers
 *
 * @example
 * ```ts
 * // Query
 * const query = useQuery(orpc.apiKeys.list.queryOptions({ input: { organizationId } }));
 *
 * // Mutation with cache invalidation
 * const mutation = useMutation({
 *   ...orpc.apiKeys.create.mutationOptions(),
 *   onSuccess: () => {
 *     queryClient.invalidateQueries({ queryKey: orpc.apiKeys.queryKey() });
 *   },
 * });
 * ```
 */
export const orpc = createTanstackQueryUtils(orpcClient);
