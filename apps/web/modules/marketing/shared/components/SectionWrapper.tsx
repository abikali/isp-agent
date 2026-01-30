"use client";

import { cn } from "@ui/lib";
import { motion } from "motion/react";
import type { ReactNode } from "react";

interface SectionWrapperProps {
	children: ReactNode;
	className?: string;
	id?: string;
	ariaLabelledBy?: string;
	/** Whether to add the mesh gradient background */
	withMesh?: boolean;
	/** Whether to use dark/inverted background */
	inverted?: boolean;
	/** Padding size variant */
	padding?: "sm" | "md" | "lg" | "xl";
}

const paddingClasses = {
	sm: "py-12 md:py-16",
	md: "py-16 md:py-24",
	lg: "py-20 md:py-32",
	xl: "py-24 md:py-40",
};

export function SectionWrapper({
	children,
	className,
	id,
	ariaLabelledBy,
	withMesh = false,
	inverted = false,
	padding = "lg",
}: SectionWrapperProps) {
	return (
		<motion.section
			id={id}
			aria-labelledby={ariaLabelledBy}
			initial={{ opacity: 0 }}
			whileInView={{ opacity: 1 }}
			viewport={{ once: true, margin: "-100px" }}
			transition={{ duration: 0.5 }}
			className={cn(
				"relative w-full overflow-hidden",
				paddingClasses[padding],
				withMesh && "bg-mesh",
				inverted && "bg-foreground text-background",
				className,
			)}
		>
			<div className="container relative z-10">{children}</div>
		</motion.section>
	);
}

interface SectionHeaderProps {
	badge?: string;
	title: string;
	description?: string;
	centered?: boolean;
	className?: string;
}

export function SectionHeader({
	badge,
	title,
	description,
	centered = true,
	className,
}: SectionHeaderProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true }}
			transition={{ duration: 0.5 }}
			className={cn(
				"mb-12 md:mb-16",
				centered && "mx-auto max-w-2xl text-center",
				className,
			)}
		>
			{badge && (
				<span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm">
					<span className="size-2 rounded-full bg-highlight" />
					<span className="font-medium text-muted-foreground">
						{badge}
					</span>
				</span>
			)}
			<h2
				id={title.toLowerCase().replace(/\s+/g, "-")}
				className="mt-4 font-bold text-3xl tracking-tight md:text-4xl lg:text-5xl"
			>
				{title}
			</h2>
			{description && (
				<p className="mt-4 text-lg text-muted-foreground md:text-xl">
					{description}
				</p>
			)}
		</motion.div>
	);
}
