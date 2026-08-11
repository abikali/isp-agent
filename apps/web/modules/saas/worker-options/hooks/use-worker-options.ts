"use client";

import {
	DEFAULT_WORKER_OPTIONS,
	type WorkerOptionListKey,
} from "@repo/database/worker-options";
import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export interface WorkerOptionChoice {
	value: string;
	label: string;
}

/**
 * One admin-managed worker-portal dropdown.
 *
 * Falls back to the built-in defaults whenever the organization has no rows
 * for the list — while the query is in flight, and as a floor if the seed was
 * never run. A dropdown in the field portal is never empty.
 */
export function useWorkerOptions(listKey: WorkerOptionListKey) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.workerOptions.list.queryOptions({
					input: { organizationId, listKey },
				})
			: disabledQuery(["workerOptions", "list", listKey]),
	);

	const stored = query.data?.options;
	// Memoized so `options` / `labelOf` keep a stable identity — callers pass
	// them into useMemo dependency arrays.
	const options = useMemo<WorkerOptionChoice[]>(
		() =>
			(stored?.length ? stored : DEFAULT_WORKER_OPTIONS[listKey]).map(
				(option) => ({ value: option.value, label: option.label }),
			),
		[stored, listKey],
	);

	/**
	 * Display label for a stored value. Historic rows can reference an option
	 * an admin has since deleted, so this falls through to the built-in
	 * defaults and finally to the raw code rather than rendering nothing.
	 */
	const labelOf = useCallback(
		(value: string | null | undefined): string => {
			if (!value) {
				return "";
			}
			return (
				options.find((option) => option.value === value)?.label ??
				DEFAULT_WORKER_OPTIONS[listKey].find(
					(option) => option.value === value,
				)?.label ??
				value
			);
		},
		[options, listKey],
	);

	return { options, labelOf, isLoading: query.isLoading };
}

/** Every list at once — for the settings screen. */
export function useAllWorkerOptions() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.workerOptions.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["workerOptions", "list"]),
	);

	return { options: query.data?.options ?? [], isLoading: query.isLoading };
}

export const useCreateWorkerOption = createInvalidatingMutation(
	() => orpc.workerOptions.create.mutationOptions(),
	() => [orpc.workerOptions.key()],
);

export const useUpdateWorkerOption = createInvalidatingMutation(
	() => orpc.workerOptions.update.mutationOptions(),
	() => [orpc.workerOptions.key()],
);

export const useDeleteWorkerOption = createInvalidatingMutation(
	() => orpc.workerOptions.delete.mutationOptions(),
	() => [orpc.workerOptions.key()],
);
