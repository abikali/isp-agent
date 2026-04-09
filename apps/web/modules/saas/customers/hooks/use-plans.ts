"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function usePlans(filters?: { search?: string }) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.servicePlans.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return { plans: query.data?.plans ?? [] };
}

export function usePlansQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.servicePlans.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["servicePlans", "list"]),
	);

	return {
		plans: query.data?.plans ?? [],
		isLoading: query.isLoading,
	};
}

export const useCreatePlan = createInvalidatingMutation(
	() => orpc.servicePlans.create.mutationOptions(),
	() => orpc.servicePlans.key(),
);

export const useUpdatePlan = createInvalidatingMutation(
	() => orpc.servicePlans.update.mutationOptions(),
	() => orpc.servicePlans.key(),
);

export const useDeletePlan = createInvalidatingMutation(
	() => orpc.servicePlans.delete.mutationOptions(),
	() => orpc.servicePlans.key(),
);
