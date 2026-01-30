"use client";

import type { OrganizationMetadata } from "@repo/auth";
import { authClient } from "@repo/auth/client";
import { orpcClient } from "@shared/lib/orpc";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";

// Query key factories for cache invalidation
export const organizationsQueryKeys = {
	all: () => ["organizations"] as const,
	lists: () => [...organizationsQueryKeys.all(), "list"] as const,
	list: () => ["user", "organizations"] as const,
	details: () => [...organizationsQueryKeys.all(), "detail"] as const,
	detail: (id: string) => [...organizationsQueryKeys.details(), id] as const,
	active: (slug: string) => ["user", "activeOrganization", slug] as const,
	roles: (organizationId: string) =>
		[...organizationsQueryKeys.detail(organizationId), "roles"] as const,
};

export const useOrganizationListQuery = () => {
	return useQuery({
		queryKey: organizationsQueryKeys.list(),
		queryFn: async () => {
			const { data, error } = await authClient.organization.list();

			if (error) {
				throw new Error(
					error.message || "Failed to fetch organizations",
				);
			}

			return data;
		},
	});
};

export const useActiveOrganizationQuery = (
	slug: string,
	options?: {
		enabled?: boolean;
	},
) => {
	const enabled = options?.enabled ?? true;

	return useQuery({
		queryKey: organizationsQueryKeys.active(slug),
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.getFullOrganization({
					query: {
						organizationSlug: slug,
					},
				});

			if (error) {
				throw new Error(
					error.message || "Failed to fetch active organization",
				);
			}

			return data;
		},
		enabled,
		// Prevent immediate refetch during hydration - data is typically prefetched
		// This reduces unnecessary network requests and state updates during page load
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};
/**
 * Query options for fetching full organization data.
 * Use this to build query configs for ensureQueryData in server loaders.
 */
export function fullOrganizationQueryOptions(id: string) {
	return {
		queryKey: organizationsQueryKeys.detail(id),
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.getFullOrganization({
					query: {
						organizationId: id,
					},
				});

			if (error) {
				throw new Error(
					error.message || "Failed to fetch full organization",
				);
			}

			return data;
		},
	};
}

export const useFullOrganizationQuery = (id: string) => {
	return useQuery(fullOrganizationQueryOptions(id));
};

/**
 * Hook to fetch full organization with Suspense support.
 * MUST be used within a Suspense boundary.
 */
export const useFullOrganizationSuspense = (id: string) => {
	return useSuspenseQuery(fullOrganizationQueryOptions(id));
};

/*
 * Create organization
 */
export const createOrganizationMutationKey = ["create-organization"] as const;
export const useCreateOrganizationMutation = () => {
	return useMutation({
		mutationKey: createOrganizationMutationKey,
		mutationFn: async ({
			name,
			metadata,
		}: {
			name: string;
			metadata?: OrganizationMetadata;
		}) => {
			const { slug } = await orpcClient.organizations.generateSlug({
				name,
			});

			// Build create params conditionally to avoid exactOptionalPropertyTypes errors
			const createParams: {
				name: string;
				slug: string;
				metadata?: Record<string, unknown>;
			} = { name, slug };
			if (metadata) {
				createParams.metadata = metadata;
			}

			const { error, data } =
				await authClient.organization.create(createParams);

			if (error) {
				throw error;
			}

			return data;
		},
	});
};

/*
 * Update organization
 */
export const updateOrganizationMutationKey = ["update-organization"] as const;
export const useUpdateOrganizationMutation = () => {
	return useMutation({
		mutationKey: updateOrganizationMutationKey,
		mutationFn: async ({
			id,
			name,
			metadata,
			updateSlug,
		}: {
			id: string;
			name: string;
			metadata?: OrganizationMetadata;
			updateSlug?: boolean;
		}) => {
			// Build update data conditionally to avoid exactOptionalPropertyTypes errors
			const updateData: {
				name: string;
				slug?: string;
				metadata?: Record<string, unknown>;
			} = { name };

			if (updateSlug) {
				const { slug } = await orpcClient.organizations.generateSlug({
					name,
				});
				updateData.slug = slug;
			}

			if (metadata) {
				updateData.metadata = metadata;
			}

			const { error, data } = await authClient.organization.update({
				organizationId: id,
				data: updateData,
			});

			if (error) {
				throw error;
			}

			return data;
		},
	});
};
