"use client";

import { config } from "@repo/config";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { ArrowRightIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { motion } from "motion/react";
import {
	floatVariants,
	heroImageVariants,
	heroTextVariants,
} from "../lib/motion";

// Responsive WebP image paths for optimal performance
const heroImages = {
	light: {
		srcSet: "/images/hero-image-566.webp 566w, /images/hero-image-1132.webp 1132w, /images/hero-image.webp 2356w",
		src: "/images/hero-image.webp",
		fallback: "/images/hero-image.png",
	},
	dark: {
		srcSet: "/images/hero-image-dark-566.webp 566w, /images/hero-image-dark-1132.webp 1132w, /images/hero-image-dark.webp 2356w",
		src: "/images/hero-image-dark.webp",
		fallback: "/images/hero-image-dark.png",
	},
};

// Sizes attribute for responsive images (matches actual display sizes)
const heroImageSizes =
	"(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 566px";

export function HeroSection() {
	return (
		<section className="relative min-h-[90vh] w-full overflow-hidden">
			{/* Background gradient */}
			<div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.15),transparent)]" />
			<div className="absolute inset-0 -z-10 bg-mesh opacity-50" />

			<div className="container relative z-10 pt-32 pb-16 md:pt-40 md:pb-24 lg:pt-48">
				<div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
					{/* Left side - Text content */}
					<div className="text-center lg:text-left">
						{/* Badge */}
						<motion.div
							variants={heroTextVariants}
							initial="hidden"
							animate="visible"
							custom={0}
							className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm"
						>
							<SparklesIcon className="size-4 text-highlight" />
							<span className="font-medium text-muted-foreground">
								New: AI-Powered Analytics
							</span>
						</motion.div>

						{/* Headline */}
						<motion.h1
							variants={heroTextVariants}
							initial="hidden"
							animate="visible"
							custom={1}
							className="font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
						>
							Your Digital Identity,{" "}
							<span className="text-gradient-highlight">
								Elevated
							</span>
						</motion.h1>

						{/* Subheadline */}
						<motion.p
							variants={heroTextVariants}
							initial="hidden"
							animate="visible"
							custom={2}
							className="mx-auto mt-6 max-w-lg text-lg text-muted-foreground md:text-xl lg:mx-0"
						>
							Create stunning profiles, capture leads, and track
							engagement. One link for all your professional
							connections.
						</motion.p>

						{/* CTA buttons */}
						<motion.div
							variants={heroTextVariants}
							initial="hidden"
							animate="visible"
							custom={3}
							className="mt-8 flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
						>
							<Button size="lg" variant="primary" asChild>
								<Link to="/login">
									Create Free Profile
									<ArrowRightIcon className="ml-2 size-4" />
								</Link>
							</Button>
							<Button size="lg" variant="outline" asChild>
								<a href="#features">See How It Works</a>
							</Button>
						</motion.div>

						{/* Trust indicator */}
						<motion.div
							variants={heroTextVariants}
							initial="hidden"
							animate="visible"
							custom={4}
							className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground lg:justify-start"
						>
							<UsersIcon className="size-4" />
							<span>Join 10,000+ professionals</span>
						</motion.div>
					</div>

					{/* Right side - Hero mockup */}
					<motion.div
						variants={heroImageVariants}
						initial="hidden"
						animate="visible"
						className="relative"
					>
						<div className="relative mx-auto max-w-lg lg:max-w-none">
							{/* Main image container */}
							<div className="relative rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-black/10">
								{/* Light mode image - LCP element with high priority */}
								<picture className="block dark:hidden">
									<source
										srcSet={heroImages.light.srcSet}
										sizes={heroImageSizes}
										type="image/webp"
									/>
									<img
										src={heroImages.light.fallback}
										srcSet={heroImages.light.srcSet}
										sizes={heroImageSizes}
										alt={`${config.appName} dashboard preview`}
										className="w-full rounded-xl"
										width={1132}
										height={730}
										fetchPriority="high"
										decoding="async"
									/>
								</picture>
								{/* Dark mode image */}
								<picture className="hidden dark:block">
									<source
										srcSet={heroImages.dark.srcSet}
										sizes={heroImageSizes}
										type="image/webp"
									/>
									<img
										src={heroImages.dark.fallback}
										srcSet={heroImages.dark.srcSet}
										sizes={heroImageSizes}
										alt={`${config.appName} dashboard preview`}
										className="w-full rounded-xl"
										width={1132}
										height={730}
										fetchPriority="high"
										decoding="async"
									/>
								</picture>
							</div>

							{/* Floating elements */}
							<FloatingBadge
								className="absolute -top-4 -right-4 md:-top-8 md:-right-8"
								delay={0}
							>
								<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
									<div className="size-2 rounded-full bg-success" />
									<span className="text-xs font-medium">
										Lead captured!
									</span>
								</div>
							</FloatingBadge>

							<FloatingBadge
								className="absolute -bottom-4 -left-4 md:-bottom-8 md:-left-8"
								delay={0.5}
							>
								<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
									<span className="text-xs font-medium">
										+127 views today
									</span>
								</div>
							</FloatingBadge>
						</div>
					</motion.div>
				</div>
			</div>

			{/* Scroll indicator */}
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 1.5 }}
				className="absolute bottom-8 left-1/2 -translate-x-1/2"
			>
				<motion.div
					animate={{ y: [0, 8, 0] }}
					transition={{
						duration: 1.5,
						repeat: Number.POSITIVE_INFINITY,
					}}
					className="flex flex-col items-center gap-2 text-muted-foreground"
				>
					<span className="text-xs">Scroll to explore</span>
					<div className="h-8 w-5 rounded-full border-2 border-current p-1">
						<motion.div
							animate={{ y: [0, 8, 0] }}
							transition={{
								duration: 1.5,
								repeat: Number.POSITIVE_INFINITY,
							}}
							className="size-1.5 rounded-full bg-current"
						/>
					</div>
				</motion.div>
			</motion.div>
		</section>
	);
}

interface FloatingBadgeProps {
	children: React.ReactNode;
	className?: string;
	delay?: number;
}

function FloatingBadge({ children, className, delay = 0 }: FloatingBadgeProps) {
	return (
		<motion.div
			variants={floatVariants}
			initial="initial"
			animate="animate"
			transition={{ delay }}
			className={cn("hidden md:block", className)}
		>
			{children}
		</motion.div>
	);
}
