import { db } from "@repo/database";

/**
 * Fetches active service plans for the organization and formats them
 * as a system prompt section for the AI agent.
 *
 * Returns `undefined` if disabled, or if no active plans exist.
 */
export async function fetchServicePlansSection(
	organizationId: string,
	enabled: boolean,
): Promise<string | undefined> {
	if (!enabled) {
		return undefined;
	}

	const plans = await db.servicePlan.findMany({
		where: { organizationId, archived: false },
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
			`   Price: ${plan.monthlyPrice}/month`,
		];
		if (plan.description) {
			lines.push(`   ${plan.description}`);
		}
		return lines.join("\n");
	});

	return [
		"SERVICE PLANS (use this to answer customer questions about plans, pricing, and speeds):",
		"",
		...planLines,
		"",
		"When discussing plans, use ONLY the information above. Do not invent details.",
	].join("\n");
}
