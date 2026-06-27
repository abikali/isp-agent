"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";

export type Base = ReturnType<typeof useBases>["bases"][number];

export function useBases() {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.bases.list.queryOptions({
			input: { organizationId: organizationId ?? "" },
		}),
	);

	return { bases: query.data?.bases ?? [] };
}

export function useCreateBase() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.bases.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.bases.key() });
		},
	});
}

export function useUpdateBase() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.bases.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.bases.key() });
		},
	});
}

export function useDeleteBase() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.bases.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.bases.key() });
		},
	});
}
