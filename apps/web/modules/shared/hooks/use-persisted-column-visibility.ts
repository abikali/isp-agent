"use client";

import type { VisibilityState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

/**
 * Lifts column visibility state out of DataTable so consumers can render the
 * toggle UI anywhere (e.g. inside a custom toolbar). Persists to localStorage
 * under `dt-cols:{key}` — the same key DataTable uses in legacy mode.
 */
export function usePersistedColumnVisibility(
	key: string,
): [VisibilityState, (next: VisibilityState) => void] {
	const [visibility, setVisibility] = useState<VisibilityState>(() => {
		if (typeof window === "undefined") {
			return {};
		}
		try {
			const stored = window.localStorage.getItem(`dt-cols:${key}`);
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	});

	const update = useCallback(
		(next: VisibilityState) => {
			setVisibility(next);
			try {
				window.localStorage.setItem(
					`dt-cols:${key}`,
					JSON.stringify(next),
				);
			} catch {
				// localStorage may throw in private mode — silently ignore.
			}
		},
		[key],
	);

	return [visibility, update];
}
