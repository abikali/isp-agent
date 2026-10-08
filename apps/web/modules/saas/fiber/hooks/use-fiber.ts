"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

export type FiberOverview = Awaited<
	ReturnType<typeof orpcClient.fiber.overview>
>;
export type FiberLeadsInput = Parameters<typeof orpcClient.fiber.leads.list>[0];
export type FiberLeadRow = Awaited<
	ReturnType<typeof orpcClient.fiber.leads.list>
>["leads"][number];
export type FiberLeadDetail = Awaited<
	ReturnType<typeof orpcClient.fiber.leads.get>
>;
export type AtRiskInput = Parameters<typeof orpcClient.fiber.atRisk>[0];
export type AtRiskRow = Awaited<
	ReturnType<typeof orpcClient.fiber.atRisk>
>["customers"][number];

export function useFiberOverview() {
	const organizationId = useOrganizationId() ?? "";
	return useSuspenseQuery(
		orpc.fiber.overview.queryOptions({ input: { organizationId } }),
	).data;
}

export function useFiberLeads(
	filters: Omit<FiberLeadsInput, "organizationId">,
) {
	const organizationId = useOrganizationId();
	return useQuery(
		organizationId
			? orpc.fiber.leads.list.queryOptions({
					input: { organizationId, ...filters },
				})
			: disabledQuery(["fiber", "leads", "list"]),
	);
}

export function useFiberLead(id: string | null) {
	const organizationId = useOrganizationId();
	return useQuery(
		organizationId && id
			? orpc.fiber.leads.get.queryOptions({
					input: { organizationId, id },
				})
			: disabledQuery(["fiber", "leads", "get"]),
	);
}

export function useFiberLeadForCustomer(customerId: string, enabled: boolean) {
	const organizationId = useOrganizationId();
	return useQuery(
		organizationId && enabled
			? orpc.fiber.leads.forCustomer.queryOptions({
					input: { organizationId, customerId },
				})
			: disabledQuery(["fiber", "leads", "forCustomer"]),
	);
}

export function useAtRiskCustomers(
	filters: Omit<AtRiskInput, "organizationId">,
) {
	const organizationId = useOrganizationId();
	return useQuery(
		organizationId
			? orpc.fiber.atRisk.queryOptions({
					input: { organizationId, ...filters },
				})
			: disabledQuery(["fiber", "atRisk"]),
	);
}

// Every fiber mutation can move a KPI, a list and a lead sheet at once —
// invalidate the whole module.
export const useUpdateFiberLead = createInvalidatingMutation(
	() => orpc.fiber.leads.update.mutationOptions(),
	() => orpc.fiber.key(),
);
// A call or note touches one lead (and maybe New → Contacted) — no need to
// rescore the defend list.
export const useLogFiberContact = createInvalidatingMutation(
	() => orpc.fiber.leads.log.mutationOptions(),
	() => [orpc.fiber.leads.key(), orpc.fiber.overview.key()],
);
export const useCreateFiberLead = createInvalidatingMutation(
	() => orpc.fiber.leads.create.mutationOptions(),
	() => orpc.fiber.key(),
);
export const useAddCustomersToFiber = createInvalidatingMutation(
	() => orpc.fiber.leads.addCustomers.mutationOptions(),
	() => orpc.fiber.key(),
);
export const useSetFiberAreaStatus = createInvalidatingMutation(
	() => orpc.fiber.areas.setStatus.mutationOptions(),
	() => orpc.fiber.key(),
);
export const useRescanFiber = createInvalidatingMutation(
	() => orpc.fiber.rescan.mutationOptions(),
	() => orpc.fiber.key(),
);
