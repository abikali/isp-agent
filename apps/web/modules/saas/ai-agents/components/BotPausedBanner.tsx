"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { HandIcon, HourglassIcon, PlayIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useResumeConversation } from "../hooks/use-conversations";
import { formatMinutes } from "../lib/chat-utils";

export interface BotPaused {
	reason: "takeover" | "awaiting-human" | "deferred-ack";
	since: Date | string;
	until: Date | string | null;
}

/**
 * Why the AI is not answering this chat, with the button that makes it
 * answer now (Resume clears the takeover and the teammate wait, and forces a
 * reply to the customer's last message).
 */
export function BotPausedBanner({
	conversationId,
	organizationId,
	botPaused,
}: {
	conversationId: string;
	organizationId: string;
	botPaused: BotPaused | null | undefined;
}) {
	const resume = useResumeConversation();
	const [now, setNow] = useState(() => Date.now());
	const active = Boolean(botPaused);
	useEffect(() => {
		if (!active) {
			return;
		}
		const interval = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(interval);
	}, [active]);

	if (!botPaused) {
		return null;
	}

	const urgent = botPaused.reason === "awaiting-human";
	return (
		<div
			className={cn(
				"flex items-center gap-2 border-b px-4 py-2",
				urgent
					? "bg-red-50 dark:bg-red-950/30"
					: "bg-amber-50 dark:bg-amber-950/30",
			)}
		>
			{urgent ? (
				<HourglassIcon className="size-4 shrink-0 text-red-600 dark:text-red-400" />
			) : (
				<HandIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
			)}
			<span
				className={cn(
					"flex-1 text-xs",
					urgent
						? "text-red-800 dark:text-red-300"
						: "text-amber-800 dark:text-amber-300",
				)}
			>
				{bannerText(botPaused, now)}
			</span>
			<Button
				variant="outline"
				size="sm"
				className="h-6 shrink-0 text-xs"
				onClick={() =>
					resume.mutate({ conversationId, organizationId })
				}
				disabled={resume.isPending}
			>
				<PlayIcon className="mr-1 size-3" />
				{botPaused.reason === "takeover"
					? "Resume AI"
					: "Let AI answer"}
			</Button>
		</div>
	);
}

function bannerText(botPaused: BotPaused, now: number): string {
	switch (botPaused.reason) {
		case "takeover": {
			const left = botPaused.until
				? formatMinutes(new Date(botPaused.until).getTime() - now)
				: "";
			return left
				? `AI paused — human takeover (${left} left)`
				: "AI paused — human takeover";
		}
		case "awaiting-human":
			return `Customer waiting for the team · ${formatMinutes(
				now - new Date(botPaused.since).getTime(),
			)} — AI is holding back`;
		case "deferred-ack":
			return "AI stayed silent (customer replying to a teammate)";
	}
}
