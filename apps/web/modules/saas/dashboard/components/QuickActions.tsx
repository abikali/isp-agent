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

const TONE_ICON_BG: Record<Action["tone"], string> = {
	info: "bg-info/12 text-info ring-info/30",
	success: "bg-success/12 text-success ring-success/30",
	purple: "bg-chart-4/12 text-chart-4 ring-chart-4/30",
	cyan: "bg-chart-5/12 text-chart-5 ring-chart-5/30",
	warning: "bg-warning/12 text-warning ring-warning/30",
};

const TONE_HOVER: Record<Action["tone"], string> = {
	info: "hover:border-info/40",
	success: "hover:border-success/40",
	purple: "hover:border-chart-4/40",
	cyan: "hover:border-chart-5/40",
	warning: "hover:border-warning/40",
};

const ACTIONS: Action[] = [
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

export function QuickActions({ organizationSlug }: QuickActionsProps) {
	return (
		<section className="space-y-2">
			<h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				Quick actions
			</h3>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
				{ACTIONS.map((action) => (
					<Link
						key={action.title}
						to={action.to}
						params={{ organizationSlug }}
						preload="intent"
						className={cn(
							"group relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs transition-all",
							"hover:-translate-y-px hover:shadow-sm",
							TONE_HOVER[action.tone],
						)}
					>
						<div
							className={cn(
								"flex size-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
								TONE_ICON_BG[action.tone],
							)}
						>
							<action.icon className="size-4" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium leading-tight text-foreground">
								{action.title}
							</div>
							<p className="truncate text-[11px] text-muted-foreground">
								{action.description}
							</p>
						</div>
						<ArrowUpRightIcon
							className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
							aria-hidden
						/>
					</Link>
				))}
			</div>
		</section>
	);
}
