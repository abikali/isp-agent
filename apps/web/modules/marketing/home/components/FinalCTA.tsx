"use client";

import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { motion } from "motion/react";
import { fadeUpVariants, staggerContainerVariants } from "../lib/motion";

const benefits = [
	"Free forever plan available",
	"No credit card required",
	"Set up in under 2 minutes",
];

export function FinalCTA() {
	return (
		<section className="relative overflow-hidden bg-foreground py-24 text-background md:py-32">
			{/* Background pattern */}
			<div className="absolute inset-0 opacity-5">
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-background via-transparent to-transparent" />
				<div
					className="absolute inset-0"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
					}}
				/>
			</div>

			<div className="container relative z-10">
				<motion.div
					variants={staggerContainerVariants}
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true }}
					className="mx-auto max-w-3xl text-center"
				>
					<motion.h2
						variants={fadeUpVariants}
						className="font-bold text-4xl tracking-tight md:text-5xl lg:text-6xl"
					>
						Ready to{" "}
						<span className="bg-gradient-to-r from-highlight to-orange-400 bg-clip-text text-transparent">
							Stand Out?
						</span>
					</motion.h2>

					<motion.p
						variants={fadeUpVariants}
						className="mx-auto mt-6 max-w-xl text-lg text-background/70 md:text-xl"
					>
						Join thousands of professionals who are elevating their
						digital presence with LibanCom.
					</motion.p>

					{/* Benefits */}
					<motion.ul
						variants={fadeUpVariants}
						className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2"
					>
						{benefits.map((benefit) => (
							<li
								key={benefit}
								className="flex items-center gap-2 text-sm text-background/70"
							>
								<CheckIcon className="size-4 text-highlight" />
								{benefit}
							</li>
						))}
					</motion.ul>

					{/* CTA Button */}
					<motion.div variants={fadeUpVariants} className="mt-10">
						<Button
							size="lg"
							className="bg-background text-foreground hover:bg-background/90"
							asChild
						>
							<Link to="/login">
								Create Your Free Profile
								<ArrowRightIcon className="ml-2 size-4" />
							</Link>
						</Button>
					</motion.div>
				</motion.div>
			</div>
		</section>
	);
}
