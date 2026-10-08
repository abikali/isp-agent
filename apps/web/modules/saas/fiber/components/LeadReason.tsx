"use client";

import { formatDateTime } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	BotIcon,
	HandCoinsIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageCircleIcon,
	SparklesIcon,
} from "lucide-react";
import { useState } from "react";
import {
	isCustomerVoice,
	SIGNAL_LABELS,
	type SignalKind,
	signalKind,
	signalText,
} from "../lib/signals";

const KIND_ICON: Record<SignalKind, LucideIcon> = {
	chat: MessageCircleIcon,
	ticket: BotIcon,
	broadcast: MegaphoneIcon,
	stop: HandCoinsIcon,
	afterStop: MessageCircleIcon,
};

/** Texts longer than this start folded, with a "Show all" toggle. */
const FOLD_AT = 700;
/** Signals shown before "Show earlier". */
const VISIBLE_SIGNALS = 3;

export interface LeadSignal {
	id: string;
	ref: string | null;
	body: string | null;
	createdAt: Date | string;
}

/**
 * The first thing an admin reads on a lead: one sentence on why this person
 * is in the pipeline, then the actual words that put them there — the
 * customer's message, the bot's ticket, the collector's note — in full.
 */
export function LeadReason({
	summary,
	signals,
	fallback,
}: {
	summary: string | null;
	/** Newest first. */
	signals: LeadSignal[];
	/** Shown when nothing was detected automatically (added by staff). */
	fallback: string;
}) {
	const [showAll, setShowAll] = useState(false);
	const visible = showAll ? signals : signals.slice(0, VISIBLE_SIGNALS);
	return (
		<section className="space-y-3 rounded-lg border border-info/30 bg-info/5 p-4">
			<div>
				<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-info">
					<SparklesIcon className="size-3.5" />
					Why they're here
				</p>
				<p className="mt-1 text-base font-medium leading-snug">
					{summary || fallback}
				</p>
			</div>
			{visible.map((signal) => (
				<SignalQuote key={signal.id} signal={signal} />
			))}
			{signals.length > VISIBLE_SIGNALS && (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setShowAll((v) => !v)}
				>
					{showAll
						? "Show fewer"
						: `Show ${signals.length - VISIBLE_SIGNALS} earlier`}
				</Button>
			)}
		</section>
	);
}

function SignalQuote({ signal }: { signal: LeadSignal }) {
	const kind = signalKind(signal.ref);
	const text = signalText(kind, signal.body);
	const [open, setOpen] = useState(false);
	const long = text.length > FOLD_AT;
	const Icon = KIND_ICON[kind];
	if (!text) {
		return null;
	}
	return (
		<div className="space-y-1">
			<p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
				<Icon className="size-3.5" />
				<span className="font-medium text-foreground">
					{SIGNAL_LABELS[kind]}
				</span>
				· {formatDateTime(signal.createdAt)}
			</p>
			<div
				// dir="auto": Arabic reads right-to-left, Arabizi left-to-right.
				dir="auto"
				className={cn(
					"whitespace-pre-wrap break-words rounded-lg border bg-background p-3 text-sm leading-relaxed",
					isCustomerVoice(kind) && "rounded-tl-sm",
					long && !open && "max-h-56 overflow-hidden",
				)}
			>
				{text}
			</div>
			{long && (
				<Button
					variant="link"
					size="sm"
					className="h-auto p-0 text-xs"
					onClick={() => setOpen((v) => !v)}
				>
					{open ? "Show less" : "Show the whole message"}
				</Button>
			)}
		</div>
	);
}
