"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function useWorkerWorkload() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.tasks.workload.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return { workers: query.data?.workers ?? [] };
}

export function usePendingUninstalledItems() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.tasks.uninstalledItems.list.queryOptions({
					input: { organizationId, status: "PENDING" },
				})
			: disabledQuery(["tasks", "uninstalledItems"]),
	);

	return {
		items: query.data?.items ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
	};
}

export const useReviewUninstalledItem = createInvalidatingMutation(
	() => orpc.tasks.uninstalledItems.review.mutationOptions(),
	() => [orpc.tasks.key(), orpc.stock.key()],
);

export const useCompleteTaskWithEvidence = createInvalidatingMutation(
	() => orpc.tasks.completeWithEvidence.mutationOptions(),
	() => [orpc.tasks.key(), orpc.installations.key(), orpc.stock.key()],
);

export function useCreateEvidenceUploadUrl() {
	return useMutation(orpc.tasks.createEvidenceUploadUrl.mutationOptions());
}
