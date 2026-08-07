"use client";

import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { PageShell } from "@shared/components/PageShell";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardDescription, CardTitle } from "@ui/components/card";
import {
	AlertTriangleIcon,
	BotIcon,
	CheckCircleIcon,
	MessageSquareIcon,
	PlusIcon,
	RadioIcon,
} from "lucide-react";
import { useState } from "react";
import { useAgents } from "../hooks/use-agents";
import { CreateAgentDialog } from "./CreateAgentDialog";

export function AgentsList({ organizationSlug }: { organizationSlug: string }) {
	const { agents } = useAgents();
	const [showCreate, setShowCreate] = useState(false);

	const enabledCount = agents.filter((a) => a.enabled).length;
	const channelCount = agents.reduce((a, ag) => a + ag._count.channels, 0);
	const conversationCount = agents.reduce(
		(a, ag) => a + ag._count.conversations,
		0,
	);
	const maintenanceCount = agents.filter((a) => a.maintenanceActive).length;

	return (
		<PageShell
			title="AI Agents"
			description="Manage your chat agents for web, WhatsApp, and Telegram"
			actions={
				<Button onClick={() => setShowCreate(true)}>
					<PlusIcon className="size-4" />
					New agent
				</Button>
			}
		>
			{agents.length > 0 && (
				<MetricStrip columns={4}>
					<MetricCard
						label="Agents"
						value={agents.length}
						icon={BotIcon}
						tone="info"
					/>
					<MetricCard
						label="Active"
						value={enabledCount}
						icon={CheckCircleIcon}
						tone="success"
						hint={
							maintenanceCount > 0
								? `${maintenanceCount} in maintenance`
								: undefined
						}
					/>
					<MetricCard
						label="Channels"
						value={channelCount}
						icon={RadioIcon}
						tone="purple"
					/>
					<MetricCard
						label="Conversations"
						value={conversationCount}
						icon={MessageSquareIcon}
						tone="cyan"
					/>
				</MetricStrip>
			)}

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
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{agents.map((agent) => (
						<Link
							key={agent.id}
							to="/app/$organizationSlug/ai-agents/$agentId"
							params={{
								organizationSlug,
								agentId: agent.id,
							}}
							className="group block"
							preload="intent"
						>
							<Card className="h-full transition-[transform,border-color,box-shadow] hover:-translate-y-px hover:border-border-strong hover:shadow-sm">
								<div className="space-y-3 p-4">
									<div className="flex items-start justify-between gap-2">
										<div className="flex min-w-0 items-center gap-2.5">
											<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-chart-4/12 text-chart-4">
												<BotIcon className="size-4" />
											</div>
											<CardTitle className="min-w-0 truncate text-sm font-medium">
												{agent.name}
											</CardTitle>
										</div>
										<div className="flex shrink-0 items-center gap-1">
											{agent.maintenanceActive && (
												<Badge
													variant="outline"
													className="border-warning/40 text-warning"
												>
													<AlertTriangleIcon className="size-3" />
												</Badge>
											)}
											<Badge
												variant={
													agent.enabled
														? "default"
														: "secondary"
												}
												className="text-[10px]"
											>
												{agent.enabled
													? "Active"
													: "Disabled"}
											</Badge>
										</div>
									</div>
									{agent.description && (
										<CardDescription className="line-clamp-2 text-xs">
											{agent.description}
										</CardDescription>
									)}
									<div className="flex items-center gap-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
										<span className="flex items-center gap-1 tabular-nums">
											<RadioIcon className="size-3" />
											{agent._count.channels}
										</span>
										<span className="flex items-center gap-1 tabular-nums">
											<MessageSquareIcon className="size-3" />
											{agent._count.conversations}
										</span>
									</div>
								</div>
							</Card>
						</Link>
					))}
				</div>
			)}

			<CreateAgentDialog open={showCreate} onOpenChange={setShowCreate} />
		</PageShell>
	);
}
