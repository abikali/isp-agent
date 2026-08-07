"use client";

import { useSyncExternalStore } from "react";

// The value never changes after mount, so there is nothing to subscribe to.
function emptySubscribe(): () => void {
	return () => {};
}

function getSnapshot(): boolean {
	return true;
}

function getServerSnapshot(): boolean {
	return false;
}

/**
 * A hook that returns true once the component has mounted on the client.
 * Useful for avoiding hydration mismatches when rendering client-only content.
 *
 * Implemented with `useSyncExternalStore` (server snapshot `false`, client
 * snapshot `true`) instead of a mount-effect setState, so hydration still
 * renders the server value first without an extra state/effect cycle.
 *
 * @returns true if running on the client, false during SSR
 *
 * @example
 * ```tsx
 * const isClient = useIsClient();
 *
 * if (!isClient) {
 *   return null; // or a skeleton/placeholder
 * }
 *
 * return <ClientOnlyComponent />;
 * ```
 */
export function useIsClient(): boolean {
	return useSyncExternalStore(emptySubscribe, getSnapshot, getServerSnapshot);
}
