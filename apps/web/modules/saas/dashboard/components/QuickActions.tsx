"use client";

import { Link } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import {
	ActivityIcon,
	ArrowUpRightIcon,
	BotIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	UsersIcon,
} from "lucide-react";

interface QuickActionsProps {
	organizationSlug: string;
}

interface Action {
	to:
		| "/app/$organizationSlug/customers"
		| "/app/$organizationSlug/watchers"
		| "/app/$organizationSlug/ai-agents"
		| "/app/$organizationSlug/conversations"
		| "/app/$organizationSlug/marketing";
	icon: LucideIcon;
	tone: "info" | "success" | "purple" | "cyan" | "warning";
	title: string;
	description: string;
}

const TONE_CLASSES: Record<Action["tone"], string> = {
	info: "text-info",
	success: "text-success",
	purple: "text-chart-4",
	cyan: "text-chart-5",
	warning: "text-warning",
};

export function QuickActions({ organizationSlug }: QuickActionsProps) {
	const actions: Action[] = [
		{
			to: "/app/$organizationSlug/customers",
			icon: UsersIcon,
			tone: "info",
			title: "Customers",
			description: "Manage subscribers",
		},
		{
			to: "/app/$organizationSlug/watchers",
			icon: ActivityIcon,
			tone: "success",
			title: "Watchers",
			description: "Monitor infrastructure",
		},
		{
			to: "/app/$organizationSlug/ai-agents",
			icon: BotIcon,
			tone: "purple",
			title: "AI Agents",
			description: "Configure assistants",
		},
		{
			to: "/app/$organizationSlug/conversations",
			icon: MessageSquareIcon,
			tone: "cyan",
			title: "Conversations",
			description: "Open inbox",
		},
		{
			to: "/app/$organizationSlug/marketing",
			icon: MegaphoneIcon,
			tone: "warning",
			title: "Marketing",
			description: "Send a broadcast",
		},
	];

	return (
		<section className="space-y-3">
			<h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				Quick actions
			</h3>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
				{actions.map((action) => (
					<Link
						key={action.title}
						to={action.to}
						params={{ organizationSlug }}
						preload="intent"
						className={cn(
							"group relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-xs transition-colors",
							"hover:bg-surface-subtle/60 hover:border-border-strong",
						)}
					>
						<div className="flex items-center justify-between">
							<div
								className={cn(
									"flex size-8 items-center justify-center rounded-md bg-surface-subtle",
									TONE_CLASSES[action.tone],
								)}
							>
								<action.icon className="size-4" />
							</div>
							<ArrowUpRightIcon
								className="size-4 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
								aria-hidden
							/>
						</div>
						<div className="mt-1">
							<div className="text-sm font-medium leading-tight text-foreground">
								{action.title}
							</div>
							<p className="text-xs text-muted-foreground">
								{action.description}
							</p>
						</div>
					</Link>
				))}
			</div>
		</section>
	);
}
