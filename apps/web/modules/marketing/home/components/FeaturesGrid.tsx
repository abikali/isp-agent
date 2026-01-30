"use client";

import { cn } from "@ui/lib";
import { motion } from "motion/react";
import {
	SectionHeader,
	SectionWrapper,
} from "../../shared/components/SectionWrapper";
import { features } from "../data/features";
import { bentoContainerVariants, bentoItemVariants } from "../lib/motion";
import { FeatureCard } from "./FeatureCard";

export function FeaturesGrid() {
	return (
		<SectionWrapper id="features" withMesh>
			<SectionHeader
				badge="Features"
				title="Everything You Need to Stand Out"
				description="Powerful tools to create, share, and track your digital identity"
			/>

			<motion.div
				variants={bentoContainerVariants}
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, margin: "-50px" }}
				className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(180px,auto)] md:gap-5 lg:gap-6"
			>
				{features.map((feature) => {
					// Calculate grid classes based on span configuration
					const colSpan =
						feature.span.cols === 2
							? "lg:col-span-2"
							: "lg:col-span-1";
					const rowSpan =
						feature.span.rows === 2
							? "lg:row-span-2"
							: "lg:row-span-1";

					return (
						<motion.div
							key={feature.id}
							variants={bentoItemVariants}
							className={cn(colSpan, rowSpan)}
						>
							<FeatureCard feature={feature} />
						</motion.div>
					);
				})}
			</motion.div>
		</SectionWrapper>
	);
}
