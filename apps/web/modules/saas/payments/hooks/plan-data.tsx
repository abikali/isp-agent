"use client";

import type { config } from "@repo/config";
import type { ReactNode } from "react";

type ProductReferenceId = keyof (typeof config)["payments"]["plans"];

export function usePlanData() {
	const planData: Record<
		ProductReferenceId,
		{
			title: string;
			description: ReactNode;
			features: ReactNode[];
		}
	> = {
		free: {
			title: "Free",
			description: "Perfect for getting started",
			features: ["Basic features included", "Limited support"],
		},
		pro: {
			title: "Pro",
			description: "For professionals and small teams",
			features: ["All features included", "Full support"],
		},
		enterprise: {
			title: "Enterprise",
			description: "For large organizations",
			features: ["Unlimited projects", "Enterprise support"],
		},
		lifetime: {
			title: "Lifetime",
			description: "One-time payment, lifetime access",
			features: ["No recurring costs", "Extended support"],
		},
	};

	return { planData };
}
