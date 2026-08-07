"use client";

import type { QueryKey } from "@tanstack/react-query";
import {
	type UseMutationOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

/**
 * Factory for mutation hooks that should invalidate a specific query key
 * (or multiple keys) on success. Centralizes the `useQueryClient` +
 * `useMutation` + `invalidateQueries` boilerplate so every module's hook
 * file can expose one-liner hooks.
 *
 * Supply a function that returns the orpc mutation options, plus a
 * function that returns the query key(s) to invalidate.
 *
 * `getOptions` is memoized inside the hook so the options object isn't
 * re-created on every render (orpc's `mutationOptions()` allocates a new
 * record each call). `getInvalidationKeys` is called per-success so it
 * reflects the current orpc client state.
 */
export function createInvalidatingMutation<TData, TVariables, TError = Error>(
	getOptions: () => UseMutationOptions<TData, TError, TVariables>,
	getInvalidationKeys: () => QueryKey | QueryKey[],
) {
	return () => {
		const queryClient = useQueryClient();
		// getOptions is a factory-time closure, so its identity never changes
		// between renders of the returned hook — listing it keeps the deps
		// exhaustive without ever re-running the memo.
		const options = useMemo(() => getOptions(), [getOptions]);
		return useMutation({
			...options,
			onSuccess: () => {
				const keys = getInvalidationKeys();
				const keyList = Array.isArray(keys[0])
					? (keys as QueryKey[])
					: [keys as QueryKey];
				for (const key of keyList) {
					queryClient.invalidateQueries({ queryKey: key });
				}
			},
		});
	};
}
