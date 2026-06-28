"use client";

import { usePaymentStatsQuery } from "@saas/billing/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { CountBadge } from "@shared/components/CountBadge";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import {
	BanknoteIcon,
	FileTextIcon,
	GaugeIcon,
	HandCoinsIcon,
	HardHatIcon,
	type LucideIcon,
	OctagonXIcon,
	PhoneCallIcon,
	WalletIcon,
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
		id: "collectors",
		label: "Collectors",
		to: "/collectors",
		icon: WalletIcon,
		resource: "manage",
	},
	{
		id: "workers",
		label: "Worker Cash",
		to: "/workers",
		icon: HardHatIcon,
		resource: "manage",
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
		id: "followups",
		label: "Follow-ups",
		to: "/followups",
		icon: PhoneCallIcon,
		resource: "view",
	},
];

export function BillingNav() {
	const { activeOrganization } = useActiveOrganization();
	const location = useLocation();
	const { data: paymentStats } = usePaymentStatsQuery();
	if (!activeOrganization) {
		return null;
	}
	const base = `/app/${activeOrganization.slug}/billing`;
	const path = location.pathname.replace(base, "").replace(/\/$/, "");

	// Per-tab badge counts. Same source as the sidebar's Billing badge so the
	// number stays in sync when the user clicks through.
	const badges: Record<string, number> = {
		payments: paymentStats?.unreviewedCount ?? 0,
	};

	return (
		<nav className="-mx-1 flex overflow-x-auto pb-1">
			<ul className="no-scrollbar flex list-none gap-0.5">
				{TABS.map((tab) => {
					const target = `${base}${tab.to}`;
					const isActive =
						(tab.to === "" && path === "") || path === tab.to;
					const count = badges[tab.id] ?? 0;
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
								<CountBadge count={count} size="sm" />
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
