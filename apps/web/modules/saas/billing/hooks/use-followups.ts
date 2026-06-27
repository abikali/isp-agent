"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";

export function useFollowups(filters: {
	isDone?: boolean;
	status?: string;
	search?: string;
	page?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.followups.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return {
		followups: query.data?.followups ?? [],
		total: query.data?.total ?? 0,
		statusCounts: query.data?.statusCounts ?? [],
		totalPages: query.data?.totalPages ?? 1,
	};
}

export const useCreateFollowup = createInvalidatingMutation(
	() => orpc.followups.create.mutationOptions(),
	() => orpc.followups.key(),
);

export const useUpdateFollowup = createInvalidatingMutation(
	() => orpc.followups.update.mutationOptions(),
	() => orpc.followups.key(),
);
