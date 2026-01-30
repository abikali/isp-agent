"use client";

import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";

interface QuickActionsProps {
	organizationSlug: string;
}

export function QuickActions({ organizationSlug }: QuickActionsProps) {
	const actions = [
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
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{actions.map((action) => (
					<Link
						key={action.title}
						to={action.to}
						params={{ organizationSlug }}
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
