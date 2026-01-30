import { type Config, config } from "@repo/config";

const plans = config.payments.plans as Config["payments"]["plans"];

export type PlanId = keyof typeof config.payments.plans;

/**
 * Type guard to check if a string is a valid PlanId
 * Use this instead of unsafe `as PlanId` casts
 */
export function isPlanId(id: string | undefined | null): id is PlanId {
	if (!id) {
		return false;
	}
	return id in plans;
}

/**
 * Safely get plan config with validated PlanId
 * Returns null if the planId is not valid
 */
export function getPlanConfig(planId: string | undefined | null) {
	if (!isPlanId(planId)) {
		return null;
	}
	return plans[planId];
}

interface Purchase {
	id: string;
	organizationId: string | null;
	userId: string | null;
	type: "SUBSCRIPTION" | "ONE_TIME";
	customerId: string;
	subscriptionId: string | null;
	productId: string;
	status: string | null;
}

type PurchaseWithoutTimestamps = Purchase;

function getActivePlanFromPurchases(purchases?: PurchaseWithoutTimestamps[]) {
	const subscriptionPurchase = purchases?.find(
		(purchase) => purchase.type === "SUBSCRIPTION",
	);

	if (subscriptionPurchase) {
		const plan = Object.entries(plans).find(([_, plan]) =>
			plan.prices?.some(
				(price) => price.productId === subscriptionPurchase.productId,
			),
		);

		return {
			id: plan?.[0] as PlanId,
			price: plan?.[1].prices?.find(
				(price) => price.productId === subscriptionPurchase.productId,
			),
			status: subscriptionPurchase.status,
			purchaseId: subscriptionPurchase.id,
		};
	}

	const oneTimePurchase = purchases?.find(
		(purchase) => purchase.type === "ONE_TIME",
	);

	if (oneTimePurchase) {
		const plan = Object.entries(plans).find(([_, plan]) =>
			plan.prices?.some(
				(price) => price.productId === oneTimePurchase.productId,
			),
		);

		return {
			id: plan?.[0] as PlanId,
			price: plan?.[1].prices?.find(
				(price) => price.productId === oneTimePurchase.productId,
			),
			status: "active",
			purchaseId: oneTimePurchase.id,
		};
	}

	const freePlan = Object.entries(plans).find(([_, plan]) => plan.isFree);

	return freePlan
		? {
				id: freePlan[0] as PlanId,
				status: "active",
			}
		: null;
}

/**
 * Get plan configuration from a productId
 * Returns the plan with its id and full config, or null if not found
 */
export function getPlanFromProductId(productId: string) {
	const planEntry = Object.entries(plans).find(([_, plan]) =>
		plan.prices?.some((price) => price.productId === productId),
	);

	if (!planEntry) {
		return null;
	}

	const [id, planConfig] = planEntry;
	return { id: id as PlanId, ...planConfig };
}

export function createPurchasesHelper(purchases: PurchaseWithoutTimestamps[]) {
	const activePlan = getActivePlanFromPurchases(purchases);

	const hasSubscription = (planIds?: PlanId[] | PlanId) => {
		return (
			!!activePlan &&
			(Array.isArray(planIds)
				? planIds.includes(activePlan.id)
				: planIds === activePlan.id)
		);
	};

	const hasPurchase = (planId: PlanId) => {
		return !!purchases?.some((purchase) =>
			Object.entries(plans)
				.find(([id]) => id === planId)?.[1]
				.prices?.some(
					(price) => price.productId === purchase.productId,
				),
		);
	};

	return { activePlan, hasSubscription, hasPurchase };
}
