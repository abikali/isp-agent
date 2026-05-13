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
		<div className="space-y-5 lg:space-y-7">
			{menuItems.map((item) => (
				<div key={item.title}>
					{/* Section header — desktop only */}
					<div className="hidden items-center gap-2 px-3 lg:flex">
						<h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
							{item.title}
						</h2>
					</div>

					{/* Items — horizontal scroll on mobile, vertical list on desktop */}
					<nav className="lg:mt-2">
						<ul className="no-scrollbar flex list-none gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
							{item.items.map((subitem) => {
								const active = isActiveMenuItem(subitem.href);
								return (
									<li key={subitem.href} className="shrink-0">
										<Link
											to={subitem.href}
											preload="intent"
											className={cn(
												"flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
												active
													? "bg-accent text-foreground"
													: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
											)}
											data-active={active}
										>
											<span className="hidden shrink-0 text-muted-foreground lg:inline [&_svg]:size-4">
												{subitem.icon}
											</span>
											<span className="lg:flex-1">
												{subitem.title}
											</span>
										</Link>
									</li>
								);
							})}
						</ul>
					</nav>
				</div>
			))}
		</div>
	);
}
