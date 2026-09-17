"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

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

/**
 * Resolves only after the customers queries have refetched, so the approvals
 * card (and a dialog reopened right away) never seeds from the pre-save values.
 */
export function useUpdateSetupRequest() {
	const queryClient = useQueryClient();
	return useMutation({
		...orpc.customers.setupRequests.update.mutationOptions(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: orpc.customers.key() }),
	});
}

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
 * Edit the unit price of a bundled installation line before approval
 * (0 = item given free to the client, not billed to the worker).
 * The setup-request list embeds the lines, so invalidate customers too.
 */
export const useUpdateSetupItemPrice = createInvalidatingMutation(
	() => orpc.installations.updatePending.mutationOptions(),
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
