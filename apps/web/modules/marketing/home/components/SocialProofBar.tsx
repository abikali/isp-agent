"use client";

import { motion, useInView } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { companyLogos, stats } from "../data/stats";
import { counterVariants, staggerContainerVariants } from "../lib/motion";

export function SocialProofBar() {
	return (
		<section className="relative border-y border-border bg-muted/30 py-12">
			<div className="container">
				<div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
					{/* Stats */}
					<motion.div
						variants={staggerContainerVariants}
						initial="hidden"
						whileInView="visible"
						viewport={{ once: true }}
						className="flex flex-wrap justify-center gap-8 lg:gap-12"
					>
						{stats.map((stat) => (
							<StatCounter key={stat.id} stat={stat} />
						))}
					</motion.div>

					{/* Divider */}
					<div className="hidden h-12 w-px bg-border lg:block" />

					{/* Company logos */}
					<div className="flex flex-col items-center gap-4">
						<span className="text-xs uppercase tracking-wider text-muted-foreground">
							Trusted by teams at
						</span>
						<motion.div
							variants={staggerContainerVariants}
							initial="hidden"
							whileInView="visible"
							viewport={{ once: true }}
							className="flex flex-wrap items-center justify-center gap-6"
						>
							{companyLogos.map((logo) => (
								<motion.div
									key={logo.id}
									variants={counterVariants}
									className="grayscale opacity-60 transition-all duration-300 hover:opacity-100 hover:grayscale-0"
								>
									<img
										src={logo.src}
										alt={logo.name}
										className="h-6 w-auto object-contain md:h-8"
										loading="lazy"
									/>
								</motion.div>
							))}
						</motion.div>
					</div>
				</div>
			</div>
		</section>
	);
}

interface StatCounterProps {
	stat: (typeof stats)[0];
}

// Easing function for smooth animation (ease-out cubic)
function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

function StatCounter({ stat }: StatCounterProps) {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true });
	const [displayValue, setDisplayValue] = useState("0");
	const animationRef = useRef<number | null>(null);

	const formatNumber = useCallback((num: number) => {
		if (num >= 1000000) {
			return `${(num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1)}M`;
		}
		if (num >= 1000) {
			return `${(num / 1000).toFixed(num % 1000 === 0 ? 0 : 1)}K`;
		}
		return num.toLocaleString();
	}, []);

	useEffect(() => {
		if (!isInView) {
			return;
		}

		const duration = 2000; // 2 seconds
		const startTime = performance.now();
		const target = stat.numericValue;

		const animate = (currentTime: number) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Apply easing for smooth animation
			const easedProgress = easeOutCubic(progress);
			const currentValue = Math.floor(target * easedProgress);

			// Only update if the formatted display value actually changes
			const newDisplayValue = formatNumber(currentValue);
			setDisplayValue((prev) =>
				prev !== newDisplayValue ? newDisplayValue : prev,
			);

			if (progress < 1) {
				animationRef.current = requestAnimationFrame(animate);
			} else {
				// Ensure we end at the exact target value
				setDisplayValue(formatNumber(target));
			}
		};

		animationRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [isInView, stat.numericValue, formatNumber]);

	return (
		<motion.div
			ref={ref}
			variants={counterVariants}
			className="flex flex-col items-center text-center"
		>
			<span className="font-bold text-3xl tabular-nums md:text-4xl">
				{displayValue}
				{stat.suffix}
			</span>
			<span className="mt-1 text-sm text-muted-foreground">
				{stat.label}
			</span>
		</motion.div>
	);
}
