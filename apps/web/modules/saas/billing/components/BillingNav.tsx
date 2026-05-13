"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import {
	BanknoteIcon,
	BarChart3Icon,
	FileTextIcon,
	GaugeIcon,
	HandCoinsIcon,
	type LucideIcon,
	OctagonXIcon,
} from "lucide-react";

interface BillingTab {
	id: string;
	label: string;
	to: string;
	icon: LucideIcon;
	resource: "view" | "manage" | "collect";
}

const TABS: BillingTab[] = [
	{
		id: "overview",
		label: "Overview",
		to: "",
		icon: GaugeIcon,
		resource: "view",
	},
	{
		id: "collect",
		label: "Unpaid",
		to: "/collect",
		icon: HandCoinsIcon,
		resource: "collect",
	},
	{
		id: "invoices",
		label: "Invoices",
		to: "/invoices",
		icon: FileTextIcon,
		resource: "view",
	},
	{
		id: "payments",
		label: "Payments",
		to: "/payments",
		icon: BanknoteIcon,
		resource: "view",
	},
	{
		id: "stopped",
		label: "Stopped",
		to: "/stopped",
		icon: OctagonXIcon,
		resource: "view",
	},
	{
		id: "reports",
		label: "Reports",
		to: "/reports",
		icon: BarChart3Icon,
		resource: "manage",
	},
];

export function BillingNav() {
	const { activeOrganization } = useActiveOrganization();
	const location = useLocation();
	if (!activeOrganization) {
		return null;
	}
	const base = `/app/${activeOrganization.slug}/billing`;
	const path = location.pathname.replace(base, "").replace(/\/$/, "");

	return (
		<nav className="-mx-1 flex overflow-x-auto pb-1">
			<ul className="no-scrollbar flex list-none gap-0.5">
				{TABS.map((tab) => {
					const target = `${base}${tab.to}`;
					const isActive =
						(tab.to === "" && path === "") || path === tab.to;
					return (
						<li key={tab.id} className="shrink-0">
							<Link
								to={target}
								preload="intent"
								className={cn(
									"flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
									isActive
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
								)}
								data-active={isActive}
							>
								<tab.icon className="size-3.5" />
								{tab.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
