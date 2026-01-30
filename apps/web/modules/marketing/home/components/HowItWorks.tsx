"use client";

import { PaletteIcon, RocketIcon, UserPlusIcon } from "lucide-react";
import { motion } from "motion/react";
import {
	SectionHeader,
	SectionWrapper,
} from "../../shared/components/SectionWrapper";
import { staggerContainerVariants, staggerItemVariants } from "../lib/motion";

const steps = [
	{
		id: 1,
		title: "Create Your Profile",
		description:
			"Sign up in seconds and fill in your professional details. Add your bio, links, and social media.",
		icon: UserPlusIcon,
	},
	{
		id: 2,
		title: "Customize Your Look",
		description:
			"Choose from beautiful templates. Customize colors, fonts, and layout to match your brand.",
		icon: PaletteIcon,
	},
	{
		id: 3,
		title: "Share & Grow",
		description:
			"Share via QR code, NFC, or link. Track who views your profile and capture leads automatically.",
		icon: RocketIcon,
	},
];

export function HowItWorks() {
	return (
		<SectionWrapper id="how-it-works">
			<SectionHeader
				badge="How It Works"
				title="Get Started in Minutes"
				description="Three simple steps to elevate your digital presence"
			/>

			<div className="relative">
				{/* Connecting line (desktop only) - centered through icons */}
				<div className="pointer-events-none absolute top-8 hidden h-0.5 md:block md:left-[16.67%] md:right-[16.67%]">
					<motion.div
						initial={{ scaleX: 0 }}
						whileInView={{ scaleX: 1 }}
						transition={{
							duration: 0.8,
							ease: [0.4, 0, 0.2, 1],
							delay: 0.3,
						}}
						viewport={{ once: true }}
						className="h-full origin-left bg-gradient-to-r from-border via-highlight/30 to-border"
					/>
				</div>

				{/* Steps */}
				<motion.div
					variants={staggerContainerVariants}
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true }}
					className="grid gap-8 md:grid-cols-3 md:gap-12"
				>
					{steps.map((step) => (
						<motion.div
							key={step.id}
							variants={staggerItemVariants}
							className="relative flex flex-col items-center text-center"
						>
							{/* Step number with icon */}
							<div className="relative z-10 mb-6">
								<div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card shadow-lg ring-4 ring-background">
									<step.icon className="size-7 text-foreground" />
								</div>
								<div className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-highlight text-xs font-bold text-highlight-foreground shadow-md">
									{step.id}
								</div>
							</div>

							{/* Content */}
							<h3 className="mb-2 font-semibold text-lg">
								{step.title}
							</h3>
							<p className="text-muted-foreground">
								{step.description}
							</p>
						</motion.div>
					))}
				</motion.div>
			</div>
		</SectionWrapper>
	);
}
