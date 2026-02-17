"use client";

import { orpc } from "@shared/lib/orpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { Input } from "@ui/components/input";
import { Switch } from "@ui/components/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { CheckIcon, CopyIcon, ExternalLinkIcon, GlobeIcon } from "lucide-react";
import { useState } from "react";
import { useToggleWebChat } from "../hooks/use-web-chat";

export function WebChatSettings({
	agentId,
	organizationId,
}: {
	agentId: string;
	organizationId: string;
}) {
	const { data } = useSuspenseQuery(
		orpc.aiAgents.getAgent.queryOptions({
			input: { agentId, organizationId },
		}),
	);
	const agent = data.agent;
	const toggleWebChat = useToggleWebChat();
	const [copied, setCopied] = useState(false);

	const chatUrl = agent.webChatToken
		? `${window.location.origin}/chat/${agent.webChatToken}`
		: null;

	function handleToggle(enabled: boolean) {
		toggleWebChat.mutate({
			agentId,
			organizationId,
			enabled,
		});
	}

	function handleCopy() {
		if (chatUrl) {
			navigator.clipboard.writeText(chatUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}

	return (
		<TooltipProvider>
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
								<GlobeIcon className="size-5 text-primary" />
							</div>
							<div>
								<div className="flex items-center gap-2">
									<CardTitle>Web Chat</CardTitle>
									<Badge
										variant={
											agent.webChatEnabled
												? "default"
												: "secondary"
										}
									>
										{agent.webChatEnabled
											? "Enabled"
											: "Disabled"}
									</Badge>
								</div>
								<CardDescription>
									Share a public link for anyone to chat with
									this agent
								</CardDescription>
							</div>
						</div>
						<Switch
							checked={agent.webChatEnabled}
							onCheckedChange={handleToggle}
							disabled={toggleWebChat.isPending}
						/>
					</div>
				</CardHeader>

				{agent.webChatEnabled && chatUrl && (
					<CardContent>
						<div className="flex items-center gap-2">
							<Input
								value={chatUrl}
								readOnly
								className="font-mono text-sm"
							/>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										size="icon"
										onClick={handleCopy}
										className="shrink-0"
									>
										{copied ? (
											<CheckIcon className="size-4 text-green-500" />
										) : (
											<CopyIcon className="size-4" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{copied ? "Copied!" : "Copy link"}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										size="icon"
										className="shrink-0"
										asChild
									>
										<a
											href={chatUrl}
											target="_blank"
											rel="noopener noreferrer"
										>
											<ExternalLinkIcon className="size-4" />
										</a>
									</Button>
								</TooltipTrigger>
								<TooltipContent>Open in new tab</TooltipContent>
							</Tooltip>
						</div>
					</CardContent>
				)}
			</Card>
		</TooltipProvider>
	);
}
