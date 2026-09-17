"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export function usePlans(filters?: { search?: string }) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.servicePlans.list.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return { plans: query.data?.plans ?? [] };
}

export function usePlansQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.servicePlans.list.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["servicePlans", "list"]),
	);

	return {
		plans: query.data?.plans ?? [],
		isLoading: query.isLoading,
	};
}

/**
 * Plans an existing customer can be moved to. When the organization runs
 * internal dealer lines (LIBANCOM-FIBER beside the main line), only the plans
 * of the line the customer is on — the server reads it from iRadius, the same
 * way it guards the change. Everything while that is loading or unknown; the
 * server still refuses a cross-line pick.
 */
export function useCustomerPlanChoices(customerId: string, enabled: boolean) {
	const organizationId = useOrganizationId();
	const { plans, isLoading } = usePlansQuery();

	const lineQuery = useQuery(
		organizationId && enabled
			? orpc.customers.planLine.queryOptions({
					input: { organizationId, customerId },
				})
			: disabledQuery(["customers", "planLine", customerId]),
	);
	const restrictTo = lineQuery.data?.restrictTo ?? null;

	return {
		plans: restrictTo
			? plans.filter((p) => (p.line?.id ?? null) === restrictTo.lineId)
			: plans,
		isLoading: isLoading || lineQuery.isLoading,
	};
}

/** " · LIBANCOM-FIBER" for a plan sold on an internal dealer line. */
export function planLineSuffix(plan: { line: { name: string } | null }) {
	return plan.line ? ` · ${plan.line.name}` : "";
}

export const useCreatePlan = createInvalidatingMutation(
	() => orpc.servicePlans.create.mutationOptions(),
	() => orpc.servicePlans.key(),
);

export const useUpdatePlan = createInvalidatingMutation(
	() => orpc.servicePlans.update.mutationOptions(),
	() => orpc.servicePlans.key(),
);

export const useDeletePlan = createInvalidatingMutation(
	() => orpc.servicePlans.delete.mutationOptions(),
	() => orpc.servicePlans.key(),
);
