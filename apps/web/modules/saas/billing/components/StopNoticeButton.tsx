"use client";

import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { formatDistanceToNow } from "date-fns";
import { BellRingIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSendStopNotice } from "../hooks/use-customer-notifications";

export interface StopNoticeChannelStatus {
	channel: string;
	status: string;
	error: string | null;
	createdAt: string | Date;
}

interface StopNoticeButtonProps {
	organizationId: string;
	paymentId: string;
	stopNoticeSentAt: string | Date | null;
	/** Newest first (the list selects the latest few stop-notice rows). */
	notifications: StopNoticeChannelStatus[];
}

/**
 * "Notify customer" on a pending stop, plus the "Notified 2h ago" /
 * "Not notified" marker. Opening the popover previews the exact numbers and
 * SMS text (a dry run) before anything is sent.
 */
export function StopNoticeButton({
	organizationId,
	paymentId,
	stopNoticeSentAt,
	notifications,
}: StopNoticeButtonProps) {
	const [open, setOpen] = useState(false);
	const preview = useSendStopNotice();
	const send = useSendStopNotice();

	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			preview.mutate({ organizationId, paymentId, dryRun: true });
		}
	};

	const onSend = () =>
		send.mutate(
			{ organizationId, paymentId },
			{
				onSuccess: (result) => {
					setOpen(false);
					const skipped = result.channels.filter(
						(c) => c.status === "skipped",
					);
					toast.success(
						skipped.length > 0
							? `Notification queued (${skipped.map((c) => `${c.channel}: ${c.error}`).join(", ")})`
							: "Notification queued (WhatsApp + SMS)",
					);
				},
				onError: (error) => toast.error(error.message),
			},
		);

	// Latest outcome per channel for the badge tooltip.
	const latest = new Map<string, StopNoticeChannelStatus>();
	for (const n of notifications) {
		if (!latest.has(n.channel)) {
			latest.set(n.channel, n);
		}
	}

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					{stopNoticeSentAt ? (
						<Badge variant="info" className="whitespace-nowrap">
							Notified{" "}
							{formatDistanceToNow(new Date(stopNoticeSentAt), {
								addSuffix: true,
							})}
						</Badge>
					) : (
						<Badge variant="warning" className="whitespace-nowrap">
							Not notified
						</Badge>
					)}
				</TooltipTrigger>
				<TooltipContent>
					{latest.size === 0
						? "The customer has not been notified about this stop."
						: [...latest.values()]
								.map(
									(n) =>
										`${n.channel === "sms" ? "SMS" : "WhatsApp"}: ${n.status}${n.error ? ` (${n.error})` : ""}`,
								)
								.join(" · ")}
				</TooltipContent>
			</Tooltip>

			<Popover open={open} onOpenChange={onOpenChange}>
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverTrigger asChild>
							<Button
								size="sm"
								variant="ghost"
								aria-label="Notify customer"
								disabled={send.isPending}
							>
								{send.isPending ? (
									<Loader2Icon className="size-3.5 animate-spin" />
								) : (
									<BellRingIcon className="size-3.5" />
								)}
							</Button>
						</PopoverTrigger>
					</TooltipTrigger>
					<TooltipContent>
						Notify customer (WhatsApp + SMS)
					</TooltipContent>
				</Tooltip>
				<PopoverContent className="w-80 space-y-3" align="end">
					<p className="font-medium text-sm">Notify the customer?</p>
					{preview.isPending ? (
						<div className="flex justify-center py-4">
							<Loader2Icon className="size-4 animate-spin text-muted-foreground" />
						</div>
					) : preview.error ? (
						<p className="text-destructive text-sm">
							{preview.error.message}
						</p>
					) : preview.data ? (
						<div className="space-y-2 text-sm">
							<p>
								To{" "}
								<span className="font-mono">
									{preview.data.customerPhone}
								</span>
								, asking them to call{" "}
								<span className="font-mono">
									{preview.data.contactPhone}
								</span>
								.
							</p>
							{preview.data.smsText && (
								<p
									dir="rtl"
									className="rounded-md bg-muted p-2 text-muted-foreground text-xs"
								>
									{preview.data.smsText}
								</p>
							)}
							<p className="text-muted-foreground text-xs">
								WhatsApp uses the approved stop_request_notice
								template with the same number.
							</p>
							{preview.data.channels
								.filter((c) => c.status === "skipped")
								.map((c) => (
									<p
										key={c.channel}
										className="text-amber-600 text-xs"
									>
										{c.channel === "sms"
											? "SMS"
											: "WhatsApp"}{" "}
										will be skipped: {c.error}
									</p>
								))}
							{preview.data.suppressed && (
								<p className="text-amber-600 text-xs">
									This number is on the marketing opt-out
									list. The notice will still be sent.
								</p>
							)}
						</div>
					) : null}
					<div className="flex justify-end gap-2">
						<Button
							size="sm"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							disabled={!preview.data || send.isPending}
							onClick={onSend}
						>
							Send
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</>
	);
}
