"use client";

import { cn } from "@ui/lib";
import { CheckIcon, NfcIcon, TrendingUpIcon, ZapIcon } from "lucide-react";
import { motion } from "motion/react";
import type { Feature } from "../data/features";

interface FeatureCardProps {
	feature: Feature;
}

export function FeatureCard({ feature }: FeatureCardProps) {
	const isLarge = feature.span.cols === 2 && feature.span.rows === 2;
	const isWide = feature.span.cols === 2 && feature.span.rows === 1;

	return (
		<motion.div
			whileHover={{ y: -4, transition: { duration: 0.2 } }}
			className={cn(
				"bento-card group relative h-full w-full max-w-full overflow-hidden",
				isLarge ? "p-6 md:p-8" : "p-5 md:p-6",
			)}
		>
			{/* Gradient background overlay for visual richness */}
			<div className="absolute inset-0 bg-gradient-to-br from-muted/20 via-transparent to-muted/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

			{/* Glow effect on hover */}
			<div className="bento-card-glow group-hover:opacity-100" />

			{/* Decorative corner accent */}
			<div className="absolute -top-12 -right-12 size-24 rounded-full bg-highlight/5 blur-2xl transition-all duration-500 group-hover:bg-highlight/10" />

			<div className="relative z-10 flex h-full flex-col">
				{/* Icon and title */}
				<div className="mb-4">
					<div className="mb-3 inline-flex rounded-xl bg-gradient-to-br from-muted/80 to-muted/40 p-2.5 ring-1 ring-border/50 shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:ring-border">
						<feature.icon className="size-5 text-foreground" />
					</div>
					<h3 className="font-semibold text-lg tracking-tight">
						{feature.title}
					</h3>
				</div>

				{/* Description */}
				<p className="mb-4 text-muted-foreground text-sm leading-relaxed">
					{feature.description}
				</p>

				{/* Highlights */}
				{feature.highlights && (
					<ul className="mb-4 space-y-2">
						{feature.highlights.map((highlight) => (
							<li
								key={highlight}
								className="flex items-center gap-2 text-sm text-muted-foreground"
							>
								<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success/10">
									<CheckIcon className="size-2.5 text-success" />
								</span>
								<span>{highlight}</span>
							</li>
						))}
					</ul>
				)}

				{/* Visual content - fills remaining space */}
				<div className={cn("mt-auto", isLarge && "min-h-[180px]")}>
					<FeatureVisual type={feature.visual} isWide={isWide} />
				</div>
			</div>
		</motion.div>
	);
}

interface FeatureVisualProps {
	type: Feature["visual"];
	isWide?: boolean;
}

function FeatureVisual({ type, isWide }: FeatureVisualProps) {
	switch (type) {
		case "profile":
			return <ProfilePreview />;
		case "lead":
			return <LeadCapturePreview />;
		case "qr":
			return <QRCodePreview />;
		case "nfc":
			return <NFCPreview />;
		case "analytics":
			return <AnalyticsPreview isWide={isWide} />;
		case "team":
			return <TeamPreview />;
		default:
			return null;
	}
}

function ProfilePreview() {
	return (
		<div className="relative mt-4 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-card via-card to-muted/30 p-3 md:p-4 shadow-lg shadow-black/5">
			{/* Subtle decorative gradient */}
			<div className="absolute inset-0 bg-gradient-to-br from-highlight/5 via-transparent to-transparent" />

			{/* Profile header */}
			<div className="relative flex items-center gap-3">
				<div className="relative">
					<div className="size-14 rounded-full bg-gradient-to-br from-highlight via-orange-400 to-amber-500 shadow-lg shadow-highlight/30" />
					{/* Online indicator */}
					<div className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-card bg-success" />
				</div>
				<div className="flex-1">
					<div className="h-4 w-28 rounded-md bg-foreground/80" />
					<div className="mt-1.5 h-3 w-20 rounded-md bg-muted-foreground/40" />
				</div>
			</div>

			{/* Bio placeholder */}
			<div className="relative mt-4 space-y-2">
				<div className="h-2.5 w-full rounded bg-muted-foreground/20" />
				<div className="h-2.5 w-4/5 rounded bg-muted-foreground/20" />
				<div className="h-2.5 w-3/5 rounded bg-muted-foreground/15" />
			</div>

			{/* Social links - enhanced */}
			<div className="relative mt-5 flex gap-2">
				{[
					"from-blue-400 to-blue-600",
					"from-pink-400 to-pink-600",
					"from-sky-400 to-sky-600",
					"from-purple-400 to-purple-600",
					"from-green-400 to-green-600",
				].map((gradient, i) => (
					<motion.div
						key={i}
						initial={{ scale: 0.8, opacity: 0 }}
						whileInView={{ scale: 1, opacity: 1 }}
						transition={{ delay: i * 0.05 }}
						viewport={{ once: true }}
						className={cn(
							"size-9 rounded-lg bg-gradient-to-br shadow-sm ring-1 ring-white/10 transition-transform group-hover:scale-105",
							gradient,
						)}
					/>
				))}
			</div>

			{/* Decorative gradient overlay */}
			<div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card via-card/80 to-transparent" />
		</div>
	);
}

function LeadCapturePreview() {
	return (
		<div className="mt-4 flex items-center gap-2 md:gap-3 overflow-hidden">
			{/* Lead card - enhanced */}
			<div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-2.5 md:p-3 shadow-lg shadow-black/5">
				<div className="flex items-center gap-2 md:gap-3">
					<div className="relative shrink-0">
						<div className="size-8 md:size-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 shadow-md" />
						<div className="absolute -bottom-0.5 -right-0.5 flex size-3 md:size-4 items-center justify-center rounded-full border-2 border-card bg-white">
							<span className="text-[6px] md:text-[8px]">✓</span>
						</div>
					</div>
					<div className="min-w-0 flex-1">
						<div className="h-2.5 md:h-3 w-16 md:w-24 rounded bg-foreground/70" />
						<div className="mt-1 h-2 w-20 md:w-32 rounded bg-muted-foreground/40" />
					</div>
					<motion.div
						initial={{ scale: 0 }}
						whileInView={{ scale: 1 }}
						transition={{
							delay: 0.3,
							type: "spring",
							stiffness: 200,
						}}
						viewport={{ once: true }}
						className="flex size-6 md:size-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success ring-2 ring-success/20"
					>
						<CheckIcon className="size-3 md:size-4" />
					</motion.div>
				</div>
			</div>

			{/* Animated arrow with pulse */}
			<motion.div
				animate={{ x: [0, 4, 0] }}
				transition={{
					duration: 1.5,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
				className="relative shrink-0 text-sm md:text-lg font-semibold text-highlight"
			>
				→
				<div className="absolute inset-0 animate-ping text-sm md:text-lg text-highlight/30">
					→
				</div>
			</motion.div>

			{/* CRM badge - enhanced */}
			<div className="shrink-0 rounded-lg md:rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/30 px-2.5 md:px-4 py-2 md:py-2.5 shadow-lg shadow-black/5">
				<div className="flex items-center gap-1.5 md:gap-2">
					<div className="flex size-5 md:size-6 items-center justify-center rounded-md md:rounded-lg bg-highlight/10">
						<ZapIcon className="size-3 md:size-3.5 text-highlight" />
					</div>
					<span className="text-[10px] md:text-xs font-bold">
						CRM
					</span>
				</div>
			</div>
		</div>
	);
}

// Deterministic QR code pattern that looks like a real QR code
const QR_PATTERN = [
	// Row 0-6: Top finder pattern and data
	[1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
	[1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
	[1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1],
	[1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
	[1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
	// Row 7: Timing pattern
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
	// Rows 8-13: Data rows
	[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1],
	[0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0],
	[1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 0, 1],
	[0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
	[1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1],
	[0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0],
	// Rows 14-20: Bottom finder pattern
	[1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0],
	[1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 1],
	[1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0],
	[1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0],
	[1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1],
];

function QRCodePreview() {
	return (
		<motion.div
			initial={{ scale: 0.9, opacity: 0 }}
			whileInView={{ scale: 1, opacity: 1 }}
			transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
			viewport={{ once: true }}
			className="mt-4 flex justify-center"
		>
			<div className="relative">
				{/* Subtle glow behind QR */}
				<div className="absolute inset-0 scale-110 rounded-2xl bg-gradient-to-br from-highlight/20 to-transparent blur-xl" />

				<div className="relative rounded-xl bg-white p-3 shadow-xl shadow-black/10 ring-1 ring-black/5">
					<div
						className="grid gap-[2px]"
						style={{ gridTemplateColumns: "repeat(21, 1fr)" }}
					>
						{QR_PATTERN.flat().map((cell, i) => (
							<motion.div
								key={i}
								initial={{ opacity: 0 }}
								whileInView={{ opacity: 1 }}
								transition={{ delay: i * 0.001 }}
								viewport={{ once: true }}
								className={cn(
									"size-[6px] rounded-[1px]",
									cell === 1
										? "bg-gray-900"
										: "bg-transparent",
								)}
							/>
						))}
					</div>
				</div>
			</div>
		</motion.div>
	);
}

function NFCPreview() {
	return (
		<div className="mt-4 flex justify-center">
			<div className="relative">
				{/* NFC Card - enhanced */}
				<motion.div
					whileHover={{ scale: 1.05, rotateY: 5 }}
					className="relative rounded-2xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-5 shadow-2xl shadow-black/30"
					style={{ perspective: 1000 }}
				>
					{/* Card shine effect */}
					<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-transparent" />
					<NfcIcon className="relative size-8 text-white/90" />
				</motion.div>

				{/* Pulse rings - enhanced with gradient */}
				{[1, 2, 3].map((ring) => (
					<motion.div
						key={ring}
						initial={{ scale: 1, opacity: 0.6 }}
						animate={{
							scale: [1, 1.4 + ring * 0.2],
							opacity: [0.6, 0],
						}}
						transition={{
							duration: 2,
							repeat: Number.POSITIVE_INFINITY,
							delay: ring * 0.4,
							ease: "easeOut",
						}}
						className="absolute inset-0 rounded-2xl"
						style={{
							background: `linear-gradient(135deg, transparent, rgba(var(--highlight), ${0.3 - ring * 0.08}))`,
							border: "2px solid hsl(var(--highlight))",
						}}
					/>
				))}
			</div>
		</div>
	);
}

interface AnalyticsPreviewProps {
	isWide?: boolean;
}

function AnalyticsPreview({ isWide }: AnalyticsPreviewProps) {
	const bars = isWide
		? [35, 55, 42, 70, 50, 85, 62, 78, 55, 90, 68]
		: [40, 65, 45, 80, 55, 90, 70];

	return (
		<div className="mt-4 overflow-hidden rounded-lg border border-border/40 bg-gradient-to-br from-card to-muted/20 p-2.5 md:p-3">
			{/* Stats row */}
			<div className="mb-3 flex items-center justify-between text-xs">
				<div className="flex items-center gap-2 rounded-full bg-success/10 px-2 py-1">
					<TrendingUpIcon className="size-3 text-success" />
					<span className="font-medium text-success">+24%</span>
				</div>
				<span className="text-muted-foreground">Last 7 days</span>
			</div>

			{/* Bar chart - enhanced */}
			<div className="flex items-end gap-1.5" style={{ height: 70 }}>
				{bars.map((height, i) => (
					<motion.div
						key={i}
						initial={{ height: 0 }}
						whileInView={{ height: `${height}%` }}
						transition={{
							duration: 0.6,
							delay: i * 0.05,
							ease: [0.4, 0, 0.2, 1],
						}}
						viewport={{ once: true }}
						className="relative flex-1 overflow-hidden rounded-t-md bg-gradient-to-t from-highlight/50 via-highlight to-highlight/90"
					>
						{/* Shine effect */}
						<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
					</motion.div>
				))}
			</div>

			{/* X-axis labels */}
			<div className="mt-2 flex justify-between text-[10px] text-muted-foreground/60">
				<span>Mon</span>
				<span>Today</span>
			</div>
		</div>
	);
}

function TeamPreview() {
	const avatarColors = [
		"from-blue-400 to-blue-600",
		"from-purple-400 to-purple-600",
		"from-green-400 to-green-600",
		"from-orange-400 to-orange-600",
	];

	return (
		<div className="mt-4 flex justify-center">
			<div className="flex -space-x-3">
				{avatarColors.map((color, i) => (
					<motion.div
						key={i}
						initial={{ x: -20, opacity: 0, scale: 0.8 }}
						whileInView={{ x: 0, opacity: 1, scale: 1 }}
						transition={{
							delay: i * 0.08,
							type: "spring",
							stiffness: 200,
							damping: 15,
						}}
						viewport={{ once: true }}
						className={cn(
							"relative size-11 rounded-full border-2 border-card bg-gradient-to-br shadow-lg",
							color,
						)}
					>
						{/* Avatar shine */}
						<div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 via-transparent to-transparent" />
					</motion.div>
				))}
				<motion.div
					initial={{ x: -20, opacity: 0, scale: 0.8 }}
					whileInView={{ x: 0, opacity: 1, scale: 1 }}
					transition={{
						delay: 0.4,
						type: "spring",
						stiffness: 200,
						damping: 15,
					}}
					viewport={{ once: true }}
					className="flex size-11 items-center justify-center rounded-full border-2 border-card bg-gradient-to-br from-muted to-muted/80 text-xs font-bold shadow-lg"
				>
					+99
				</motion.div>
			</div>
		</div>
	);
}
