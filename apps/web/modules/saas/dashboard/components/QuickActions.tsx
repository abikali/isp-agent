"use client";

import { Link } from "@tanstack/react-router";
import { Activity, Bot, MessageSquare, Settings, Users } from "lucide-react";

interface QuickActionsProps {
	organizationSlug: string;
}

export function QuickActions({ organizationSlug }: QuickActionsProps) {
	const actions = [
		{
			to: "/app/$organizationSlug/customers" as const,
			icon: Users,
			iconBg: "bg-blue-500/10",
			iconColor: "text-blue-500",
			title: "Customers",
			description: "Manage customer accounts",
		},
		{
			to: "/app/$organizationSlug/watchers" as const,
			icon: Activity,
			iconBg: "bg-green-500/10",
			iconColor: "text-green-500",
			title: "Watchers",
			description: "Monitor network devices",
		},
		{
			to: "/app/$organizationSlug/ai-agents" as const,
			icon: Bot,
			iconBg: "bg-purple-500/10",
			iconColor: "text-purple-500",
			title: "AI Agents",
			description: "Configure AI assistants",
		},
		{
			to: "/app/$organizationSlug/conversations" as const,
			icon: MessageSquare,
			iconBg: "bg-cyan-500/10",
			iconColor: "text-cyan-500",
			title: "Conversations",
			description: "View customer conversations",
		},
		{
			to: "/app/$organizationSlug/settings" as const,
			icon: Settings,
			iconBg: "bg-orange-500/10",
			iconColor: "text-orange-500",
			title: "Settings",
			description: "Configure organization settings",
		},
	];

	return (
		<div className="space-y-3">
			<h3 className="text-sm font-medium text-muted-foreground">
				Quick Actions
			</h3>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				{actions.map((action) => (
					<Link
						key={action.title}
						to={action.to}
						params={{ organizationSlug }}
						preload="intent"
						className="group rounded-xl border bg-card text-card-foreground p-4 transition-colors hover:bg-accent"
					>
						<div
							className={`mb-3 flex size-10 items-center justify-center rounded-lg ${action.iconBg}`}
						>
							<action.icon
								className={`size-5 ${action.iconColor}`}
							/>
						</div>
						<h4 className="font-medium">{action.title}</h4>
						<p className="text-sm text-muted-foreground">
							{action.description}
						</p>
					</Link>
				))}
			</div>
		</div>
	);
}
