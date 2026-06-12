"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function useSetupRequests(
	status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING",
) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.customers.setupRequests.list.queryOptions({
			input: { organizationId: organizationId ?? "", status },
		}),
	);

	return {
		requests: query.data?.requests ?? [],
		total: query.data?.total ?? 0,
	};
}

export function usePendingSetupRequestsCount() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.customers.setupRequests.list.queryOptions({
					input: { organizationId, status: "PENDING" },
				})
			: disabledQuery(["customers", "setupRequests"]),
	);

	return { count: query.data?.total ?? 0 };
}

export const useUpdateSetupRequest = createInvalidatingMutation(
	() => orpc.customers.setupRequests.update.mutationOptions(),
	() => orpc.customers.key(),
);

export const useApproveSetupRequest = createInvalidatingMutation(
	() => orpc.customers.setupRequests.approve.mutationOptions(),
	() => [
		orpc.customers.key(),
		orpc.installations.key(),
		orpc.billing.key(),
		orpc.stock.key(),
	],
);

export const useRejectSetupRequest = createInvalidatingMutation(
	() => orpc.customers.setupRequests.reject.mutationOptions(),
	() => [orpc.customers.key(), orpc.installations.key()],
);
