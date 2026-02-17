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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { CheckIcon, CopyIcon, TrashIcon } from "lucide-react";
import { useState } from "react";

interface ChannelCardProps {
	channel: {
		id: string;
		provider: string;
		name: string;
		webhookUrl: string;
		enabled: boolean;
		lastActivityAt: Date | string | null;
		_count: { conversations: number };
	};
	onDelete: (channelId: string) => void;
}

export function ChannelCard({ channel, onDelete }: ChannelCardProps) {
	const [copied, setCopied] = useState(false);

	const copyWebhookUrl = async () => {
		await navigator.clipboard.writeText(channel.webhookUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<TooltipProvider>
			<div className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/30">
				<div className="flex items-start justify-between">
					<div>
						<div className="flex items-center gap-2">
							<h4 className="font-medium">{channel.name}</h4>
							<Badge variant="outline">
								{channel.provider === "whatsapp"
									? "WhatsApp"
									: "Telegram"}
							</Badge>
							<Badge
								variant={
									channel.enabled ? "default" : "secondary"
								}
							>
								{channel.enabled ? "Active" : "Disabled"}
							</Badge>
						</div>
						<p className="mt-1 text-xs text-muted-foreground">
							{channel._count.conversations} conversation
							{channel._count.conversations !== 1 ? "s" : ""}
							{channel.lastActivityAt &&
								` · Last active ${new Date(channel.lastActivityAt).toLocaleDateString()}`}
						</p>
					</div>

					<AlertDialog>
						<Tooltip>
							<TooltipTrigger asChild>
								<AlertDialogTrigger asChild>
									<Button variant="ghost" size="sm">
										<TrashIcon className="size-4 text-destructive" />
									</Button>
								</AlertDialogTrigger>
							</TooltipTrigger>
							<TooltipContent>Delete channel</TooltipContent>
						</Tooltip>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Delete Channel
								</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete{" "}
									<strong>{channel.name}</strong>? This will
									disconnect the{" "}
									{channel.provider === "whatsapp"
										? "WhatsApp"
										: "Telegram"}{" "}
									integration and remove all associated
									conversation history. This action cannot be
									undone.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => onDelete(channel.id)}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									Delete Channel
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>

				<div className="mt-3 flex items-center gap-2">
					<code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
						{channel.webhookUrl}
					</code>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								onClick={copyWebhookUrl}
							>
								{copied ? (
									<CheckIcon className="size-3.5 text-green-500" />
								) : (
									<CopyIcon className="size-3.5" />
								)}
								<span className="ml-1 text-xs">
									{copied ? "Copied!" : "Copy"}
								</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Copy webhook URL</TooltipContent>
					</Tooltip>
				</div>
			</div>
		</TooltipProvider>
	);
}
