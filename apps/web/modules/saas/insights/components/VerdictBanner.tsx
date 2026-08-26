"use client";

import { cn } from "@ui/lib";
import {
	CheckCircle2Icon,
	CircleHelpIcon,
	InfoIcon,
	MinusCircleIcon,
	TrendingDownIcon,
} from "lucide-react";
import type { Verdict } from "../lib/verdict";

const TONE = {
	good: {
		icon: CheckCircle2Icon,
		ring: "border-success/30 bg-success/[0.06]",
		mark: "bg-success/12 text-success",
	},
	steady: {
		icon: MinusCircleIcon,
		ring: "border-border bg-muted/40",
		mark: "bg-muted text-muted-foreground",
	},
	watch: {
		icon: InfoIcon,
		ring: "border-warning/30 bg-warning/[0.06]",
		mark: "bg-warning/12 text-warning",
	},
	bad: {
		icon: TrendingDownIcon,
		ring: "border-destructive/30 bg-destructive/[0.06]",
		mark: "bg-destructive/12 text-destructive",
	},
	unknown: {
		icon: CircleHelpIcon,
		ring: "border-border bg-muted/40",
		mark: "bg-muted text-muted-foreground",
	},
} as const;

interface VerdictBannerProps {
	verdict: Verdict;
	/** e.g. "26 days in" — shown only for an incomplete period. */
	progressNote?: string | null;
}

/**
 * The answer, before the evidence.
 *
 * This is the only element on the page an owner is required to read. It says in
 * one sentence whether the business made money, how that compares to last time,
 * and — crucially — when the number should not be trusted yet.
 */
export function VerdictBanner({ verdict, progressNote }: VerdictBannerProps) {
	const tone = TONE[verdict.tone];
	const Icon = tone.icon;

	return (
		<section
			className={cn("rounded-xl border p-5 md:p-6", tone.ring)}
			aria-live="polite"
		>
			<div className="flex items-start gap-4">
				<div
					className={cn(
						"flex size-10 shrink-0 items-center justify-center rounded-lg",
						tone.mark,
					)}
				>
					<Icon className="size-5" />
				</div>

				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<h2 className="text-balance text-xl font-medium leading-snug tracking-tight md:text-2xl">
							{verdict.headline}
						</h2>
						{progressNote && (
							<span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
								{progressNote}
							</span>
						)}
					</div>

					{verdict.detail && (
						<p className="text-pretty text-sm text-muted-foreground md:text-base">
							{verdict.detail}
						</p>
					)}

					{verdict.caveat && (
						<p className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
							<InfoIcon className="mt-0.5 size-3.5 shrink-0" />
							<span className="text-pretty">
								{verdict.caveat}
							</span>
						</p>
					)}
				</div>
			</div>
		</section>
	);
}
