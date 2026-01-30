"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@ui/lib";
import type { ReactNode } from "react";

export function SettingsMenu({
	menuItems,
}: {
	menuItems: {
		title: string;
		avatar: ReactNode;
		items: {
			title: string;
			href: string;
			icon?: ReactNode;
		}[];
	}[];
}) {
	const location = useLocation();
	const pathname = location.pathname;

	const isActiveMenuItem = (href: string) => pathname.includes(href);

	return (
		<div className="space-y-4 lg:space-y-8">
			{menuItems.map((item, i) => (
				<div key={i}>
					{/* Header - hidden on mobile */}
					<div className="hidden lg:flex items-center justify-start gap-2">
						{item.avatar}
						<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							{item.title}
						</h2>
					</div>

					{/* Navigation items - horizontal scroll on mobile, vertical on desktop */}
					<nav className="lg:mt-4">
						<ul className="flex list-none gap-1 overflow-x-auto no-scrollbar pb-2 lg:pb-0 lg:flex-col lg:gap-2">
							{item.items.map((subitem, k) => (
								<li key={k} className="shrink-0">
									<Link
										to={subitem.href}
										className={cn(
											"flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap",
											"lg:rounded-none lg:px-0 lg:py-1.5 lg:border-l-2 lg:pl-3",
											isActiveMenuItem(subitem.href)
												? "bg-primary/10 text-primary font-medium lg:bg-transparent lg:border-primary lg:font-bold"
												: "text-muted-foreground hover:text-foreground hover:bg-muted/50 lg:hover:bg-transparent lg:border-transparent",
										)}
										data-active={isActiveMenuItem(
											subitem.href,
										)}
									>
										<span className="shrink-0 hidden lg:inline">
											{subitem.icon}
										</span>
										<span>{subitem.title}</span>
									</Link>
								</li>
							))}
						</ul>
					</nav>
				</div>
			))}
		</div>
	);
}
