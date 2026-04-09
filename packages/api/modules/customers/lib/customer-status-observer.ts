import {
	type CustomerStatusChange,
	dbRaw,
	registerCustomerStatusChangeHandler,
} from "@repo/database";
import { logger } from "@repo/logs";
import { syncActiveStatusToIRadius } from "./iradius-api";

/**
 * Pushes customer.status transitions to iRadius. Registered once at module
 * load. The change event already carries the new value, so we just need
 * the customer's iRadius identifiers (externalId / username) to fire the
 * activate-user call. The originating transaction may not have committed
 * yet — defer to next tick so callers see consistent local state first.
 */
function handleCustomerStatusChange(change: CustomerStatusChange): void {
	setTimeout(() => {
		void dispatch(change);
	}, 0);
}

async function dispatch(change: CustomerStatusChange): Promise<void> {
	try {
		const customer = await dbRaw.customer.findUnique({
			where: { id: change.customerId },
			select: { externalId: true, username: true },
		});
		if (!customer) {
			return;
		}
		syncActiveStatusToIRadius(customer, change.after === "ACTIVE");
	} catch (error) {
		logger.error("customerStatusObserver dispatch failed", {
			customerId: change.customerId,
			before: change.before,
			after: change.after,
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

registerCustomerStatusChangeHandler(handleCustomerStatusChange);
