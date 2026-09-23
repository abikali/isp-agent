"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import { Switch } from "@ui/components/switch";
import { cn } from "@ui/lib";
import {
	AlarmClockIcon,
	EyeIcon,
	Loader2Icon,
	SendIcon,
	XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
	useCancelFollowUp,
	useConversationFollowUp,
	usePreviewFollowUp,
	useSendFollowUpNow,
	useSetFollowUpMuted,
} from "../hooks/use-follow-up";

/** Human wording for `AiConversation.followUpOutcome`. */
const OUTCOME_LABELS: Record<string, string> = {
	sent: "Sent",
	send_failed: "Send failed",
	cancelled: "Cancelled by a teammate",
	model_declined: "Skipped: conversation looked finished",
	quiet_hours: "Skipped: outside sending hours",
	outside_hours: "Not queued: would land too late",
	weekly_cap: "Skipped: weekly cap reached",
	max_attempts: "Stopped: all nudges used",
	muted: "Skipped: muted",
	human_takeover: "Skipped: a teammate took over",
	maintenance: "Skipped: maintenance mode",
	conversation_not_active: "Skipped: conversation closed",
	last_message_not_a_clean_reply: "Skipped: last message wasn't the bot's",
	last_reply_not_delivered: "Skipped: bot's reply wasn't delivered",
	chat_lock_busy: "Skipped: customer was writing",
	follow_up_disabled: "Skipped: follow-ups off",
	agent_disabled: "Skipped: agent disabled",
	no_api_key: "Skipped: agent has no API key",
};

function formatWhen(value: Date | string): string {
	const date = new Date(value);
	const time = date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
	return date.toDateString() === new Date().toDateString()
		? `today ${time}`
		: `${date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/**
 * Follow-up state for one chat: what is queued and when, what it will say,
 * why the last one was skipped, and the per-chat controls.
 */
export function ConversationFollowUpSection({
	conversationId,
	organizationId,
}: {
	conversationId: string;
	organizationId: string;
}) {
	const input = { conversationId, organizationId };
	const { data, isLoading } = useConversationFollowUp(
		conversationId,
		organizationId,
	);
	const preview = usePreviewFollowUp();
	const sendNow = useSendFollowUpNow();
	const cancel = useCancelFollowUp();
	const setMuted = useSetFollowUpMuted();

	// A preview belongs to the conversation it was made for.
	const draft =
		preview.data && preview.variables?.conversationId === conversationId
			? preview.data
			: null;

	async function handleSendNow() {
		try {
			const result = await sendNow.mutateAsync(input);
			if (result.sent) {
				toast.success("Follow-up sent");
			} else {
				toast.info(
					OUTCOME_LABELS[result.skipped ?? ""] ??
						"The follow-up was not sent",
				);
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Send failed");
		}
	}

	return (
		<section className="space-y-2 px-4 py-3">
			<div className="flex items-center justify-between gap-2">
				<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Follow-up
				</div>
				{data && (
					<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<label htmlFor={`fu-mute-${conversationId}`}>
							Mute
						</label>
						<Switch
							id={`fu-mute-${conversationId}`}
							className="scale-75"
							checked={data.followUpMuted}
							disabled={setMuted.isPending}
							onCheckedChange={(muted) =>
								setMuted.mutate({ ...input, muted })
							}
						/>
					</div>
				)}
			</div>

			{isLoading || !data ? (
				<Skeleton className="h-12 w-full" />
			) : (
				<>
					<div
						className={cn(
							"rounded-md border px-3 py-2 text-xs",
							data.followUpDueAt
								? "border-info/40 bg-info/5"
								: "border-border",
						)}
					>
						{data.followUpDueAt ? (
							<div className="flex items-center justify-between gap-2">
								<span className="inline-flex items-center gap-1.5 font-medium text-info">
									<AlarmClockIcon className="size-3.5" />
									Queued for {formatWhen(data.followUpDueAt)}
								</span>
								<Badge
									variant="outline"
									className="text-[10px] tabular-nums"
								>
									{data.followUpAttempts + 1} of{" "}
									{data.maxAttempts}
								</Badge>
							</div>
						) : (
							<span className="text-muted-foreground">
								{data.followUpMuted
									? "Muted for this chat"
									: !data.enabled
										? "Follow-ups are off for this agent"
										: "Nothing queued"}
							</span>
						)}
						{data.followUpOutcome && data.followUpOutcomeAt && (
							<div className="mt-1 text-[11px] text-muted-foreground">
								Last:{" "}
								{OUTCOME_LABELS[data.followUpOutcome] ??
									data.followUpOutcome}{" "}
								· {formatWhen(data.followUpOutcomeAt)}
							</div>
						)}
						<div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
							{data.sentThisWeek} of {data.weeklyCap} nudges used
							this week · sent {data.window.start}–
							{data.window.end}
						</div>
					</div>

					{draft && (
						<div className="rounded-md border border-dashed px-3 py-2 text-xs">
							{draft.text ? (
								<>
									<p
										className="whitespace-pre-wrap"
										dir="auto"
									>
										{draft.text}
									</p>
									<p className="mt-1 text-[10px] text-muted-foreground">
										{data.followUpDueAt
											? "This exact text goes out if nothing changes before then."
											: "What a nudge would say right now."}
									</p>
								</>
							) : (
								<p className="text-muted-foreground">
									The bot would not send one: the conversation
									looks finished.
								</p>
							)}
						</div>
					)}

					<div className="flex flex-wrap gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 text-xs"
							disabled={preview.isPending}
							onClick={() =>
								preview.mutate(input, {
									onError: (error) =>
										toast.error(error.message),
								})
							}
						>
							{preview.isPending ? (
								<Loader2Icon className="size-3 animate-spin" />
							) : (
								<EyeIcon className="size-3" />
							)}
							Preview
						</Button>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 text-xs"
									disabled={sendNow.isPending}
								>
									{sendNow.isPending ? (
										<Loader2Icon className="size-3 animate-spin" />
									) : (
										<SendIcon className="size-3" />
									)}
									Send now
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Send a follow-up now?
									</AlertDialogTitle>
									<AlertDialogDescription>
										This ignores the sending hours, the
										nudge limit and the weekly cap. The bot
										still stays silent if the customer has
										written since, or if the conversation
										looks finished.
										{draft?.text
											? " It sends the previewed text if nothing has changed."
											: ""}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction onClick={handleSendNow}>
										Send
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
						{data.followUpDueAt && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 text-xs"
								disabled={cancel.isPending}
								onClick={() => cancel.mutate(input)}
							>
								<XIcon className="size-3" />
								Cancel
							</Button>
						)}
					</div>
				</>
			)}
		</section>
	);
}
