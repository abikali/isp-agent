"use client";

import { createInvalidatingMutation } from "@shared/hooks/create-invalidating-mutation";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

// Non-suspense on purpose: the search input changes the query key on every
// debounced keystroke, and a suspense query would bubble each change up to the
// route AsyncBoundary (full-page skeleton flash). useQuery + the global
// keepPreviousData default keeps the table on screen while refetching.
export function useStockItems(filters?: {
	search?: string;
	lowStockOnly?: boolean;
}) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.stock.listItems.queryOptions({
					input: { organizationId, ...filters },
				})
			: disabledQuery(["stock", "listItems"]),
	);

	return {
		items: query.data?.items ?? [],
		isLoading: query.isLoading,
		isFetching: query.isFetching,
	};
}

export function useStockItemsQuery() {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.stock.listItems.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["stock", "listItems"]),
	);

	return {
		items: query.data?.items ?? [],
		isLoading: query.isLoading,
	};
}

export function useStockLogs(filters: {
	stockItemId?: string;
	employeeId?: string;
	action?:
		| "ADD"
		| "REMOVE"
		| "TRANSFER_TO_WORKER"
		| "TRANSFER_FROM_WORKER"
		| "ADJUST"
		| "DELIVER";
	from?: Date;
	to?: Date;
	page?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useSuspenseQuery(
		orpc.stock.listLogs.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				...filters,
			},
		}),
	);

	return {
		logs: query.data?.logs ?? [],
		total: query.data?.total ?? 0,
		totalPages: query.data?.totalPages ?? 1,
	};
}

export function useWorkerStockQuery(employeeId: string | null) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId && employeeId
			? orpc.stock.workerStockByEmployee.queryOptions({
					input: { organizationId, employeeId },
				})
			: disabledQuery(["stock", "workerStock"]),
	);

	return {
		allocations: query.data?.allocations ?? [],
		totalValue: query.data?.totalValue ?? 0,
		isLoading: query.isLoading,
	};
}

export function useStockRefundRequests(filters?: {
	status?: "PENDING" | "APPROVED" | "REJECTED";
	page?: number;
}) {
	const organizationId = useOrganizationId();

	const query = useQuery(
		organizationId
			? orpc.stock.listRefundRequests.queryOptions({
					input: {
						organizationId,
						...(filters?.status ? { status: filters.status } : {}),
						...(filters?.page ? { page: filters.page } : {}),
					},
				})
			: disabledQuery(["stock", "listRefundRequests"]),
	);

	return {
		requests: query.data?.requests ?? [],
		pendingCount: query.data?.pendingCount ?? 0,
		totalPages: query.data?.totalPages ?? 1,
		isLoading: query.isLoading,
	};
}

export const useApproveStockRefund = createInvalidatingMutation(
	() => orpc.stock.approveRefund.mutationOptions(),
	() => orpc.stock.key(),
);

export const useRejectStockRefund = createInvalidatingMutation(
	() => orpc.stock.rejectRefund.mutationOptions(),
	() => orpc.stock.key(),
);

export const useCreateStockItem = createInvalidatingMutation(
	() => orpc.stock.createItem.mutationOptions(),
	() => orpc.stock.key(),
);

export const useUpdateStockItem = createInvalidatingMutation(
	() => orpc.stock.updateItem.mutationOptions(),
	() => orpc.stock.key(),
);

export const useDeleteStockItem = createInvalidatingMutation(
	() => orpc.stock.deleteItem.mutationOptions(),
	() => orpc.stock.key(),
);

export const useAddStockQuantity = createInvalidatingMutation(
	() => orpc.stock.addQuantity.mutationOptions(),
	() => orpc.stock.key(),
);

export const useDeliverToWorker = createInvalidatingMutation(
	() => orpc.stock.deliverToWorker.mutationOptions(),
	() => orpc.stock.key(),
);

export const useReturnFromWorker = createInvalidatingMutation(
	() => orpc.stock.returnFromWorker.mutationOptions(),
	() => orpc.stock.key(),
);
