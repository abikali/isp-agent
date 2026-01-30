"use client";

import { authClient } from "@repo/auth/client";
import type { PermissionRecord } from "@repo/auth/permissions";
import { disabledQuery, hasOrganizationId } from "@shared/lib/organization";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationsQueryKeys } from "../lib/api";

/**
 * Disabled query config for roles when organizationId is not available
 */
function disabledRolesQuery() {
	return {
		...disabledQuery(["organization-roles"]),
		queryFn: () => Promise.resolve({ roles: [] }),
	};
}

/**
 * Query options for fetching organization roles.
 * Use this to build query configs for ensureQueryData in server loaders.
 */
export function organizationRolesQueryOptions(organizationId: string) {
	return {
		queryKey: organizationsQueryKeys.roles(organizationId),
		queryFn: async () => {
			const { data, error } = await authClient.organization.listRoles({
				query: { organizationId },
			});

			if (error) {
				throw new Error(error.message || "Failed to fetch roles");
			}

			return { roles: data ?? [] };
		},
	};
}

/**
 * Hook to fetch organization roles.
 * Use this for components that need to handle loading state manually.
 */
export function useOrganizationRolesQuery(
	organizationId: string | null | undefined,
) {
	return useQuery(
		hasOrganizationId(organizationId)
			? organizationRolesQueryOptions(organizationId)
			: disabledRolesQuery(),
	);
}

/**
 * Hook to create a new role
 */
export function useCreateRoleMutation(organizationId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: ["create-role", organizationId],
		mutationFn: async ({
			name,
			permissions,
		}: {
			name: string;
			permissions: PermissionRecord;
		}) => {
			const { error } = await authClient.organization.createRole({
				organizationId,
				role: name,
				permission: permissions,
			});

			if (error) {
				throw error;
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationsQueryKeys.roles(organizationId),
			});
		},
	});
}

/**
 * Hook to update role permissions
 */
export function useUpdateRoleMutation(organizationId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: ["update-role", organizationId],
		mutationFn: async ({
			roleId,
			permissions,
		}: {
			roleId: string;
			permissions: PermissionRecord;
		}) => {
			const { error } = await authClient.organization.updateRole({
				organizationId,
				roleId,
				data: { permission: permissions },
			});

			if (error) {
				throw error;
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationsQueryKeys.roles(organizationId),
			});
		},
	});
}

/**
 * Hook to delete a role
 */
export function useDeleteRoleMutation(organizationId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: ["delete-role", organizationId],
		mutationFn: async (roleId: string) => {
			const { error } = await authClient.organization.deleteRole({
				organizationId,
				roleId,
			});

			if (error) {
				throw error;
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationsQueryKeys.roles(organizationId),
			});
		},
	});
}
