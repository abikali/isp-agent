"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** "Notify customer" on a pending stop (also used with `dryRun` for the preview). */
export function useSendStopNotice() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.billing.stopped.notify.mutationOptions(),
		onSuccess: (result) => {
			if (!result.dryRun) {
				queryClient.invalidateQueries({ queryKey: orpc.billing.key() });
			}
		},
	});
}

/** Delivery log of payment reminders and stop notices. */
export function useCustomerNotifications(filters: {
	kind?: "expiry_reminder" | "stop_notice";
	status?: "queued" | "sent" | "failed" | "skipped";
	page?: number;
}) {
	const organizationId = useOrganizationId();

	return useQuery(
		organizationId
			? orpc.billing.notifications.list.queryOptions({
					input: {
						organizationId,
						...filters,
						page: filters.page ?? 1,
						pageSize: 50,
					},
				})
			: disabledQuery(["billing", "notifications", "list"]),
	);
}
