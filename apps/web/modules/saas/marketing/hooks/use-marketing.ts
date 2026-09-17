"use client";

import type { AudienceInput } from "@repo/api/modules/marketing/lib/audience";
import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { isScheduled } from "../lib/status-variants";

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

export interface BroadcastsFilters {
	page?: number;
	pageSize?: number;
	status?: "pending" | "running" | "completed" | "failed" | "cancelled";
	audienceType?: "isp_customers" | "salti_group" | "csv" | "manual";
	search?: string;
}

export function useBroadcasts(filters: BroadcastsFilters = {}) {
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
	if (filters.audienceType) {
		input["audienceType"] = filters.audienceType;
	}
	if (filters.search?.trim()) {
		input["search"] = filters.search.trim();
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
			// Broadcasts scheduled for later don't change until they fire.
			const hasActive = items.some(
				(b) =>
					b.status === "running" ||
					(b.status === "pending" && !isScheduled(b)),
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
		recipientSearch?: string;
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
	if (opts.recipientSearch?.trim()) {
		input["recipientSearch"] = opts.recipientSearch.trim();
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
			const broadcast = q.state.data?.broadcast;
			if (!broadcast) {
				return false;
			}
			return broadcast.status === "running" ||
				(broadcast.status === "pending" && !isScheduled(broadcast))
				? 4_000
				: false;
		},
		refetchIntervalInBackground: false,
	});
	return {
		broadcast: query.data?.broadcast,
		creator: query.data?.creator ?? null,
		recipients: query.data?.recipients ?? [],
		recipientTotal: query.data?.recipientTotal ?? 0,
		recipientCounts: query.data?.recipientCounts ?? {
			queued: 0,
			sent: 0,
			failed: 0,
		},
		refetch: query.refetch,
	};
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
		duplicateCount: query.data?.duplicateCount ?? 0,
		suppressedCount: query.data?.suppressedCount ?? 0,
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

export const useUpdateBroadcast = createInvalidatingMutation(
	() => orpc.marketing.updateBroadcast.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useDeleteBroadcast = createInvalidatingMutation(
	() => orpc.marketing.deleteBroadcast.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useResendBroadcast = createInvalidatingMutation(
	() => orpc.marketing.resendBroadcast.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useCancelBroadcast = createInvalidatingMutation(
	() => orpc.marketing.cancelBroadcast.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useCreateAssetUploadUrl = () =>
	useMutation(orpc.marketing.createAssetUploadUrl.mutationOptions());

/**
 * Marketing opt-out list. `useQuery` (not suspense) so typing in the search
 * box keeps the previous page on screen instead of flashing a skeleton.
 */
export function useSuppressionsQuery(filters: {
	page: number;
	search: string;
}) {
	const organizationId = useOrganizationId();
	const search = filters.search.trim();
	const query = useQuery(
		organizationId
			? orpc.marketing.listSuppressions.queryOptions({
					input: {
						organizationId,
						page: filters.page,
						...(search ? { search } : {}),
					},
				})
			: disabledQuery(["marketing", "listSuppressions"]),
	);
	return {
		items: query.data?.items ?? [],
		total: query.data?.total ?? 0,
		pageSize: query.data?.pageSize ?? 50,
		isLoading: query.isLoading,
	};
}

export const useAddSuppressions = createInvalidatingMutation(
	() => orpc.marketing.addSuppressions.mutationOptions(),
	() => orpc.marketing.key(),
);

export const useRemoveSuppression = createInvalidatingMutation(
	() => orpc.marketing.removeSuppression.mutationOptions(),
	() => orpc.marketing.key(),
);
