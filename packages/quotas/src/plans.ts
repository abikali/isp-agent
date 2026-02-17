import { config } from "@repo/config";
import type { PlanLimits } from "./types";

type PlanId = keyof typeof config.payments.plans;

/**
 * Default limits for plans without explicit limits defined
 */
const DEFAULT_LIMITS: PlanLimits = {
	members: 3,
	projects: 1,
	apiCalls: 1000,
	storage: 100,
	aiMessages: 500,
	watchers: 3,
	customers: 50,
};

/**
 * Get limits for a specific plan
 */
export function getPlanLimits(planId: string): PlanLimits {
	const plans = config.payments.plans;
	if (!(planId in plans)) {
		return DEFAULT_LIMITS;
	}
	const plan = plans[planId as PlanId];
	if (!plan.limits) {
		return DEFAULT_LIMITS;
	}
	return plan.limits as PlanLimits;
}

/**
 * Check if a limit is unlimited (-1)
 */
export function isUnlimited(limit: number): boolean {
	return limit === -1;
}

/**
 * Get all available plan IDs
 */
export function getAvailablePlans(): string[] {
	return Object.keys(config.payments.plans);
}

/**
 * Get the free plan ID
 */
export function getFreePlanId(): string | undefined {
	const plans = config.payments.plans;
	for (const planId of Object.keys(plans) as PlanId[]) {
		const plan = plans[planId];
		if ("isFree" in plan && plan.isFree) {
			return planId;
		}
	}
	return undefined;
}
