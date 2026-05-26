import { db } from "@repo/database";

/**
 * Fetches active service plans for the organization and formats them
 * as a system prompt section for the AI agent.
 *
 * When `planIds` is non-empty, only those plans are included.
 * When empty, all active (non-archived) plans are included.
 *
 * Returns `undefined` if disabled, or if no active plans exist.
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
	].join("\n");
}
