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

/**
 * Live "is this username free on iRadius?" check. Pass the value to check
 * (set on blur, not on every keystroke). Disabled until a non-empty username
 * is supplied. `data.available` is `true` when the username can be used.
 */
export function useCheckIradiusUsername(username: string) {
	const organizationId = useOrganizationId();
	const trimmed = username.trim();

	return useQuery(
		organizationId && trimmed
			? orpc.customers.setupRequests.checkUsername.queryOptions({
					input: { organizationId, username: trimmed },
				})
			: disabledQuery(["customers", "checkUsername"]),
	);
}
