"use client";

import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export function useAccessPoints(filters?: {
	search?: string;
	stationId?: string;
	online?: boolean;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.accessPoints.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return { accessPoints: query.data?.accessPoints ?? [] };
}

export function useAccessPointsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.accessPoints.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["accessPoints", "list"]),
	);

	return {
		accessPoints: query.data?.accessPoints ?? [],
		isLoading: query.isLoading,
	};
}

export function useCreateAccessPoint() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.accessPoints.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.accessPoints.key(),
			});
		},
	});
}

export function useUpdateAccessPoint() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.accessPoints.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.accessPoints.key(),
			});
		},
	});
}

export function useDeleteAccessPoint() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.accessPoints.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.accessPoints.key(),
			});
		},
	});
}
