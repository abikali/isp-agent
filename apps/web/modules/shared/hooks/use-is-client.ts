"use client";

import { useEffect, useState } from "react";

/**
 * A hook that returns true once the component has mounted on the client.
 * Useful for avoiding hydration mismatches when rendering client-only content.
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
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	return isClient;
}
