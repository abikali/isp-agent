"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export type InstallationStatus =
	| "PENDING"
	| "APPROVED"
	| "COMPLETED"
	| "DENIED";

export interface InstallationFilters {
	status?: InstallationStatus;
	employeeId?: string;
	customerId?: string;
	stockItemId?: string;
	isAddOn?: boolean;
	type?: "item" | "station" | "base" | "addon";
	search?: string;
	priceMin?: number;
	priceMax?: number;
	qtyMin?: number;
	qtyMax?: number;
	from?: Date;
	to?: Date;
	page?: number;
}

export function useInstallations(filters: InstallationFilters) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.installations.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return {
		installations: query.data?.installations ?? [],
		total: query.data?.total ?? 0,
		totalPages: query.data?.totalPages ?? 1,
	};
}

export function useAddonDefaultsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.installations.addonDefaults.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["installations", "addonDefaults"]),
	);

	return {
		iptvPrice: query.data?.iptvPrice ?? 0,
		realIpPrice: query.data?.realIpPrice ?? 0,
		isLoading: query.isLoading,
	};
}

export const useUpdatePendingInstallation = createInvalidatingMutation(
	() => orpc.installations.updatePending.mutationOptions(),
	() => orpc.installations.key(),
);

export const useApproveInstallations = createInvalidatingMutation(
	() => orpc.installations.approve.mutationOptions(),
	() => [orpc.installations.key(), orpc.stock.key(), orpc.billing.key()],
);

export const useDenyInstallation = createInvalidatingMutation(
	() => orpc.installations.deny.mutationOptions(),
	() => orpc.installations.key(),
);
