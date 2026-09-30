import { db } from "@repo/database";

/**
 * Fetches active service plans for the organization and formats them
 * as a system prompt section for the AI agent.
 *
 * When `planIds` is non-empty, only those plans are included.
 * When empty, all active (non-archived) plans are included.
 *
 * Returns `undefined` if disabled, or if no active plans exist.
 *
 * Shared by every path that builds an agent prompt (webhook, web chat, debug
 * replay, the retry worker and the silence follow-up) so none of them quotes
 * prices from memory.
 */
export async function fetchServicePlansSection(
	organizationId: string,
	enabled: boolean,
	planIds?: string[],
): Promise<string | undefined> {
	if (!enabled) {
		return undefined;
	}

	const hasFilter = planIds && planIds.length > 0;

	const plans = await db.servicePlan.findMany({
		where: {
			organizationId,
			archived: false,
			...(hasFilter ? { id: { in: planIds } } : {}),
		},
		orderBy: { monthlyPrice: "asc" },
		select: {
			name: true,
			description: true,
			downloadSpeed: true,
			uploadSpeed: true,
			monthlyPrice: true,
		},
	});

	if (plans.length === 0) {
		return undefined;
	}

	const planLines = plans.map((plan, i) => {
		const lines = [
			`${i + 1}. ${plan.name}`,
			`   Download: ${plan.downloadSpeed} Mbps | Upload: ${plan.uploadSpeed} Mbps`,
			`   Price: $${plan.monthlyPrice} USD/month`,
		];
		if (plan.description) {
			lines.push(`   ${plan.description}`);
		}
		return lines.join("\n");
	});

	return [
		"SERVICE PLANS (use this to answer customer questions about plans, pricing, and speeds):",
		"All prices are in US Dollars (USD), not Lebanese Pounds (LBP). Always quote prices in USD.",
		"",
		...planLines,
		"",
		"When discussing plans, use ONLY the information above. Do not invent details.",
		'These are the plans currently on SALE. Existing subscribers are often on older plans that are not listed (e.g. "johnnyh-UP TO 6M" at $35 is not "johnnyh-UP TO 6M NEW" at $40). For a subscriber\'s own plan and price use only the "plan" field from isp-diagnose-customer / isp-search-customer or the VERIFIED CUSTOMER section.',
	].join("\n");
}
