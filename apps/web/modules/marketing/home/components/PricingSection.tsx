"use client";

import { PricingTable } from "@saas/payments/client";
import { CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import {
	SectionHeader,
	SectionWrapper,
} from "../../shared/components/SectionWrapper";
import { fadeUpVariants } from "../lib/motion";

const trustBadges = [
	"No credit card required",
	"Cancel anytime",
	"30-day money-back guarantee",
];

export function PricingSection() {
	return (
		<SectionWrapper id="pricing" padding="lg">
			<SectionHeader
				badge="Pricing"
				title="Simple, Transparent Pricing"
				description="Choose the plan that's right for you. All plans include core features."
			/>

			{/* Trust badges */}
			<motion.div
				variants={fadeUpVariants}
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true }}
				className="mx-auto mb-12 flex flex-wrap justify-center gap-x-8 gap-y-2"
			>
				{trustBadges.map((badge) => (
					<span
						key={badge}
						className="flex items-center gap-2 text-sm text-muted-foreground"
					>
						<CheckIcon className="size-4 text-success" />
						{badge}
					</span>
				))}
			</motion.div>

			{/* Pricing table with animation wrapper */}
			<motion.div
				initial={{ opacity: 0, y: 30 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true }}
				transition={{ duration: 0.6, delay: 0.2 }}
				className="mx-auto max-w-5xl"
			>
				<PricingTable />
			</motion.div>
		</SectionWrapper>
	);
}
