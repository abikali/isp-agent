import { db } from "@repo/database";
import { logger } from "@repo/logs";

/** Tool-description text for the `plan` output field. */
export const PLAN_FIELD_DESCRIPTION =
	'"plan" is the subscriber\'s CURRENT plan and monthly price from our billing records — quote it as is. Legacy plans are not in the SERVICE PLANS list; never map a customer to a catalog plan with a similar name.';

export interface LocalPlan {
	planName: string;
	/** What this subscriber pays: their billing rate, else the plan price. */
	monthlyPriceUsd: number | null;
	downloadMbps: number;
	uploadMbps: number;
	/** Whether the plan is one the agent is currently selling. */
	inCurrentCatalog: boolean;
}

/**
 * The subscriber's current plan and price from our billing records. Many
 * subscribers are on older plans no longer sold; the bot used to map them to
 * a catalog plan with a similar name and quote the wrong price.
 *
 * Scoped by organization: usernames repeat across orgs.
 */
export async function loadLocalPlan(
	organizationId: string,
	userName: string,
	servicePlanIds: string[] = [],
): Promise<LocalPlan | null> {
	// Supplementary to the diagnosis: a failed lookup must not fail the tool.
	const customer = await db.customer
		.findFirst({
			where: { organizationId, username: userName, deletedAt: null },
			orderBy: { createdAt: "desc" },
			select: {
				monthlyRate: true,
				plan: {
					select: {
						id: true,
						name: true,
						downloadSpeed: true,
						uploadSpeed: true,
						monthlyPrice: true,
					},
				},
			},
		})
		.catch((error: unknown) => {
			logger.warn("ai-local-plan-lookup-failed", {
				organizationId,
				userName,
				error: String(error),
			});
			return null;
		});
	const plan = customer?.plan;
	if (!customer || !plan) {
		return null;
	}
	return {
		planName: plan.name,
		monthlyPriceUsd: customer.monthlyRate ?? plan.monthlyPrice ?? null,
		downloadMbps: plan.downloadSpeed,
		uploadMbps: plan.uploadSpeed,
		inCurrentCatalog: servicePlanIds.includes(plan.id),
	};
}
