"use client";

import type { AudienceInput } from "@repo/api/modules/marketing/lib/audience";
import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function useIntegration() {
	const organizationId = useOrganizationId();
	const query = useQuery(
		organizationId
			? orpc.marketing.getIntegration.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["marketing", "getIntegration"]),
	);
	return {
		integration: query.data?.integration ?? null,
		isConfigured: query.data?.isConfigured ?? false,
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}

export function useTemplates() {
	const organizationId = useOrganizationId();
	const query = useSuspenseQuery(
		orpc.marketing.listTemplates.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);
	return { templates: query.data?.templates ?? [], refetch: query.refetch };
}

export function useTemplatesQuery() {
	const organizationId = useOrganizationId();
	const query = useQuery(
		organizationId
			? orpc.marketing.listTemplates.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["marketing", "listTemplates"]),
	);
	return {
		templates: query.data?.templates ?? [],
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

export function useGroupsQuery() {
	const organizationId = useOrganizationId();
	const query = useQuery(
		organizationId
			? orpc.marketing.listGroups.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["marketing", "listGroups"]),
	);
	return {
		groups: query.data?.groups ?? [],
		isLoading: query.isLoading,
		refetch: query.refetch,
	};
}

export function useBroadcasts(
	filters: {
		page?: number;
		pageSize?: number;
		status?: "pending" | "running" | "completed" | "failed" | "cancelled";
	} = {},
) {
	const organizationId = useOrganizationId();
	const input: Record<string, unknown> = {
		organizationId: organizationId ?? "",
	};
	if (filters.page) {
		input["page"] = filters.page;
	}
	if (filters.pageSize) {
		input["pageSize"] = filters.pageSize;
	}
	if (filters.status) {
		input["status"] = filters.status;
	}
	const query = useSuspenseQuery({
		...orpc.marketing.listBroadcasts.queryOptions({
			input: input as Parameters<
				typeof orpc.marketing.listBroadcasts.queryOptions
			>[0]["input"],
		}),
		// Only poll when at least one broadcast is still in flight.
		refetchInterval: (q) => {
			const items = q.state.data?.items ?? [];
			const hasActive = items.some(
				(b) => b.status === "pending" || b.status === "running",
			);
			return hasActive ? 5_000 : false;
		},
		refetchIntervalInBackground: false,
	});
	return {
		items: query.data?.items ?? [],
		total: query.data?.total ?? 0,
		page: query.data?.page ?? 1,
		pageSize: query.data?.pageSize ?? 25,
		refetch: query.refetch,
	};
}

export function useBroadcast(
	broadcastId: string,
	opts: {
		recipientStatus?: "queued" | "sent" | "failed";
		recipientPage?: number;
	} = {},
) {
	const organizationId = useOrganizationId();
	const input: Record<string, unknown> = {
		organizationId: organizationId ?? "",
		broadcastId,
	};
	if (opts.recipientStatus) {
		input["recipientStatus"] = opts.recipientStatus;
	}
	if (opts.recipientPage) {
		input["recipientPage"] = opts.recipientPage;
	}
	const query = useSuspenseQuery({
		...orpc.marketing.getBroadcast.queryOptions({
			input: input as Parameters<
				typeof orpc.marketing.getBroadcast.queryOptions
			>[0]["input"],
		}),
		// Only poll while the broadcast is in flight — terminal states
		// (completed/failed/cancelled) don't change.
		refetchInterval: (q) => {
			const status = q.state.data?.broadcast?.status;
			return status === "pending" || status === "running" ? 4_000 : false;
		},
		refetchIntervalInBackground: false,
	});
	return {
		broadcast: query.data?.broadcast,
		recipients: query.data?.recipients ?? [],
		recipientTotal: query.data?.recipientTotal ?? 0,
		refetch: query.refetch,
	};
}

export function useAudiencePreview() {
	return useMutation(orpc.marketing.previewAudience.mutationOptions());
}

/**
 * Live audience preview. Re-fetches when `audience` changes (referential).
 * Pass `enabled: false` when the audience isn't ready (empty list, missing
 * group selection, etc.) so we don't fire a useless server call.
 */
export function useAudiencePreviewQuery(
	audience: AudienceInput | null,
	enabled: boolean,
) {
	const organizationId = useOrganizationId();
	const query = useQuery(
		organizationId && audience && enabled
			? {
					...orpc.marketing.previewAudience.queryOptions({
						input: { organizationId, audience },
					}),
					staleTime: 30_000,
				}
			: disabledQuery(["marketing", "previewAudience"]),
	);
	return {
		total: query.data?.total ?? null,
		sample: query.data?.sample ?? [],
		audienceType: query.data?.audienceType,
		note: query.data?.note ?? null,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
	};
}

export const useUpsertIntegration = createInvalidatingMutation(
	() => orpc.marketing.upsertIntegration.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useDeleteIntegration = createInvalidatingMutation(
	() => orpc.marketing.deleteIntegration.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useTestConnection = createInvalidatingMutation(
	() => orpc.marketing.testConnection.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useCreateBroadcast = createInvalidatingMutation(
	() => orpc.marketing.createBroadcast.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useCancelBroadcast = createInvalidatingMutation(
	() => orpc.marketing.cancelBroadcast.mutationOptions(),
	() => orpc.marketing.key(),
);
