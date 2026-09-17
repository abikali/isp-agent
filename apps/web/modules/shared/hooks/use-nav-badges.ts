"use client";

import {
	useActiveOrganization,
	useCanAccess,
	usePermissionScope,
} from "@saas/organizations/client";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";

export interface NavBadges {
	expenses: number;
	newCustomers: number;
	billing: number;
	/** Completions waiting approval plus recovered equipment waiting review. */
	tasks: number;
	/** The completions part of `tasks`, so the link can open that queue. */
	taskApprovals: number;
	stock: number;
	installations: number;
	/** Sum of the badges this user can see — drives the collapsed-menu dot. */
	total: number;
}

/**
 * Live counts for the sidebar badges, each gated the same way the sidebar
 * gates the nav item it sits on. Shared by the sidebar and the mobile menu
 * trigger (which has no badges of its own, only a dot); React Query dedupes
 * the requests.
 */
export function useNavBadges(): NavBadges {
	const { isOrganizationAdmin } = useActiveOrganization();
	const hasPermission = useCanAccess();
	const getScope = usePermissionScope();
	const organizationId = useOrganizationId();

	const { data: paymentStats } = useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "stats"]),
	);

	const { data: installationStats } = useQuery(
		organizationId
			? orpc.installations.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["installations", "stats"]),
	);

	const { data: expenseStats } = useQuery(
		organizationId
			? orpc.expenses.stats.queryOptions({ input: { organizationId } })
			: disabledQuery(["expenses", "stats"]),
	);

	const { data: stockStats } = useQuery(
		organizationId
			? orpc.stock.stats.queryOptions({ input: { organizationId } })
			: disabledQuery(["stock", "stats"]),
	);

	const canReadTasks = hasPermission("tasks", "read");
	// Same sources as the Tasks page: AI escalations and system reviews live
	// elsewhere and must not inflate the badge. Polled because the work that
	// raises it (a worker submitting a completion) happens on another device.
	const { data: taskStats } = useQuery(
		organizationId && canReadTasks
			? {
					...orpc.tasks.stats.queryOptions({
						input: {
							organizationId,
							sources: ["MANUAL", "LEGACY"],
						},
					}),
					refetchInterval: 60_000,
				}
			: disabledQuery(["tasks", "stats"]),
	);

	const { data: setupRequests } = useQuery(
		organizationId
			? orpc.customers.setupRequests.list.queryOptions({
					input: { organizationId, status: "PENDING" },
				})
			: disabledQuery(["customers", "setupRequests"]),
	);

	// Only the people who can act on a queue get its badge.
	const canApproveTasks =
		isOrganizationAdmin || hasPermission("tasks", "approve");
	const canApproveInstallations = hasPermission("installations", "approve");
	const taskApprovals =
		canReadTasks && canApproveTasks ? (taskStats?.pendingApproval ?? 0) : 0;
	const recoveredItems =
		canReadTasks && canApproveInstallations
			? (taskStats?.pendingRecoveredItems ?? 0)
			: 0;

	const hasFullCustomerAccess =
		isOrganizationAdmin || getScope("customers", "read") === "all";

	const badges = {
		expenses: hasPermission("expenses", "read")
			? (expenseStats?.pendingCount ?? 0)
			: 0,
		newCustomers: hasFullCustomerAccess ? (setupRequests?.total ?? 0) : 0,
		billing:
			hasPermission("billing", "view") ||
			hasPermission("billing", "collect")
				? (paymentStats?.unreviewedCount ?? 0)
				: 0,
		tasks: taskApprovals + recoveredItems,
		taskApprovals,
		stock: hasPermission("inventory", "read")
			? (stockStats?.pendingRefundCount ?? 0)
			: 0,
		installations: hasPermission("installations", "read")
			? (installationStats?.pendingCount ?? 0)
			: 0,
	};

	return {
		...badges,
		total:
			badges.expenses +
			badges.newCustomers +
			badges.billing +
			badges.tasks +
			badges.stock +
			badges.installations,
	};
}
