"use client";

import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/components/card";
import { BotIcon, MessageSquareIcon, PlusIcon, RadioIcon } from "lucide-react";
import { useState } from "react";
import { useAgents } from "../hooks/use-agents";
import { CreateAgentDialog } from "./CreateAgentDialog";

export function AgentsList({ organizationSlug }: { organizationSlug: string }) {
	const { agents } = useAgents();
	const [showCreate, setShowCreate] = useState(false);

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">AI Agents</h1>
					<p className="text-muted-foreground">
						Manage your chat agents for WhatsApp and Telegram
					</p>
				</div>
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="mr-2 size-4" />
					Create Agent
				</Button>
			</div>

			{agents.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
					<BotIcon className="mb-4 size-12 text-muted-foreground/50" />
					<h3 className="mb-1 text-lg font-medium">No agents yet</h3>
					<p className="mb-4 text-sm text-muted-foreground">
						Create your first AI agent to start automating
						conversations.
					</p>
					<Button onClick={() => setShowCreate(true)}>
						<PlusIcon className="mr-2 size-4" />
						Create Agent
					</Button>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{agents.map((agent) => (
						<Link
							key={agent.id}
							to="/app/$organizationSlug/ai-agents/$agentId"
							params={{
								organizationSlug,
								agentId: agent.id,
							}}
							className="block"
							preload="intent"
						>
							<Card className="transition-colors hover:border-primary/50">
								<CardHeader>
									<div className="flex items-start justify-between">
										<CardTitle className="text-base">
											{agent.name}
										</CardTitle>
										<Badge
											variant={
												agent.enabled
													? "default"
													: "secondary"
											}
										>
											{agent.enabled
												? "Active"
												: "Disabled"}
										</Badge>
									</div>
									{agent.description && (
										<CardDescription className="line-clamp-2">
											{agent.description}
										</CardDescription>
									)}
									<div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
										<span className="flex items-center gap-1">
											<RadioIcon className="size-3" />
											{agent._count.channels} channel
											{agent._count.channels !== 1
												? "s"
												: ""}
										</span>
										<span className="flex items-center gap-1">
											<MessageSquareIcon className="size-3" />
											{agent._count.conversations}{" "}
											conversation
											{agent._count.conversations !== 1
												? "s"
												: ""}
										</span>
									</div>
								</CardHeader>
							</Card>
						</Link>
					))}
				</div>
			)}

			<CreateAgentDialog open={showCreate} onOpenChange={setShowCreate} />
		</div>
	);
}
