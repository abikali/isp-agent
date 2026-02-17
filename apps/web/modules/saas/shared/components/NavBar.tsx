"use client";
import { config } from "@repo/config";
import { useSession } from "@saas/auth/client";
import { useActiveOrganization } from "@saas/organizations/client";
import { Logo } from "@shared/components/Logo";
import { Link, useLocation } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import {
	BotIcon,
	ChevronRightIcon,
	ClipboardListIcon,
	EyeIcon,
	HardHatIcon,
	HeartIcon,
	HomeIcon,
	MessageSquareIcon,
	PackageIcon,
	RadioTowerIcon,
	SettingsIcon,
	ShieldIcon,
	UserCog2Icon,
	UsersIcon,
} from "lucide-react";
import { OrganizationSelect } from "../../organizations/components/OrganizationSelect";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

interface MenuItem {
	label: string;
	href: string;
	icon: LucideIcon;
	isActive: boolean;
}

interface MenuGroup {
	label: string;
	items: MenuItem[];
}

export function NavBar() {
	const location = useLocation();
	const pathname = location.pathname;
	const { user } = useSession();
	const { activeOrganization, loaded } = useActiveOrganization();
	const { useSidebarLayout } = config.ui.saas;

	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}`
		: "/app";

	// Group menu items into logical sections
	const menuGroups: MenuGroup[] = [
		{
			label: "Overview",
			items: [
				{
					label: "Home",
					href: basePath,
					icon: HomeIcon,
					isActive: pathname === basePath,
				},
				...(activeOrganization
					? [
							{
								label: "AI Agents",
								href: `${basePath}/ai-agents`,
								icon: BotIcon,
								isActive: pathname.startsWith(
									`${basePath}/ai-agents`,
								),
							},
							{
								label: "Conversations",
								href: `${basePath}/conversations`,
								icon: MessageSquareIcon,
								isActive: pathname.startsWith(
									`${basePath}/conversations`,
								),
							},
							{
								label: "Watchers",
								href: `${basePath}/watchers`,
								icon: EyeIcon,
								isActive: pathname.startsWith(
									`${basePath}/watchers`,
								),
							},
						]
					: []),
			],
		},
		...(activeOrganization
			? [
					{
						label: "ISP Management",
						items: [
							{
								label: "Customers",
								href: `${basePath}/customers`,
								icon: UsersIcon,
								isActive:
									pathname === `${basePath}/customers` ||
									(pathname.startsWith(
										`${basePath}/customers/`,
									) &&
										!pathname.includes("/plans") &&
										!pathname.includes("/stations")),
							},
							{
								label: "Plans",
								href: `${basePath}/customers/plans`,
								icon: PackageIcon,
								isActive: pathname.startsWith(
									`${basePath}/customers/plans`,
								),
							},
							{
								label: "Stations",
								href: `${basePath}/customers/stations`,
								icon: RadioTowerIcon,
								isActive: pathname.startsWith(
									`${basePath}/customers/stations`,
								),
							},
							{
								label: "Employees",
								href: `${basePath}/employees`,
								icon: HardHatIcon,
								isActive: pathname.startsWith(
									`${basePath}/employees`,
								),
							},
							{
								label: "Tasks",
								href: `${basePath}/tasks`,
								icon: ClipboardListIcon,
								isActive: pathname.startsWith(
									`${basePath}/tasks`,
								),
							},
						],
					},
				]
			: []),
		{
			label: "Settings",
			items: [
				...(activeOrganization
					? [
							{
								label: "Organization",
								href: `${basePath}/settings`,
								icon: SettingsIcon,
								isActive: pathname.startsWith(
									`${basePath}/settings/`,
								),
							},
						]
					: []),
				{
					label: "Account",
					href: "/app/settings",
					icon: UserCog2Icon,
					isActive: pathname.startsWith("/app/settings/"),
				},
			],
		},
		...(user?.role === "admin"
			? [
					{
						label: "Administration",
						items: [
							{
								label: "Admin Panel",
								href: "/app/admin",
								icon: ShieldIcon,
								isActive: pathname.startsWith("/app/admin/"),
							},
						],
					},
				]
			: []),
	];

	// Flatten for mobile horizontal view
	const flatMenuItems = menuGroups.flatMap((group) => group.items);

	return (
		<nav
			className={cn("w-full", {
				"w-full md:fixed md:top-0 md:left-0 md:h-full md:w-[280px] md:border-r md:border-border md:bg-background":
					useSidebarLayout,
			})}
		>
			<div
				className={cn("container max-w-6xl py-4", {
					"md:flex md:h-full md:flex-col md:px-4 md:pt-6 md:pb-0":
						useSidebarLayout,
				})}
			>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div
						className={cn("flex items-center gap-4 md:gap-2", {
							"md:flex md:w-full md:flex-col md:items-stretch md:align-stretch":
								useSidebarLayout,
						})}
					>
						<Link
							to="/app"
							className={cn("block", {
								"md:px-2 md:py-1": useSidebarLayout,
							})}
						>
							<Logo size={useSidebarLayout ? "sm" : "md"} />
						</Link>

						{config.organizations.enable &&
							!config.organizations.hideOrganization && (
								<>
									<span
										className={cn(
											"hidden opacity-30 md:block",
											{
												"md:hidden": useSidebarLayout,
											},
										)}
									>
										<ChevronRightIcon className="size-4" />
									</span>

									<OrganizationSelect
										className={cn({
											"md:-mx-2 md:mt-2":
												useSidebarLayout,
										})}
									/>
								</>
							)}
					</div>

					<div
						className={cn(
							"mr-0 ml-auto flex items-center justify-end gap-2",
							{
								"md:hidden": useSidebarLayout,
							},
						)}
					>
						<NotificationBell />
						<UserMenu />
					</div>
				</div>

				{/* Mobile: Horizontal scrollable menu (flat) */}
				<ul
					className={cn(
						"no-scrollbar -mx-4 -mb-4 mt-6 flex list-none items-center justify-start gap-1 overflow-x-auto px-4 text-sm",
						{
							"md:hidden": useSidebarLayout,
						},
					)}
				>
					{flatMenuItems.map((menuItem) => (
						<li key={menuItem.href}>
							<Link
								to={menuItem.href}
								className={cn(
									"flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 transition-colors",
									menuItem.isActive
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
								)}
								preload="intent"
							>
								<menuItem.icon className="size-4 shrink-0" />
								<span>{menuItem.label}</span>
							</Link>
						</li>
					))}
					{!loaded && (
						<>
							<li>
								<Skeleton className="h-9 w-24 rounded-md" />
							</li>
							<li>
								<Skeleton className="h-9 w-28 rounded-md" />
							</li>
						</>
					)}
				</ul>

				{/* Desktop: Grouped sidebar menu */}
				<div
					className={cn("hidden flex-1 overflow-y-auto py-4", {
						"md:block": useSidebarLayout,
					})}
				>
					<nav className="space-y-6">
						{menuGroups.map((group) => (
							<div key={group.label}>
								<h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
									{group.label}
								</h3>
								<ul className="space-y-1">
									{group.items.map((menuItem) => (
										<li key={menuItem.href}>
											<Link
												to={menuItem.href}
												className={cn(
													"flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
													menuItem.isActive
														? "bg-primary/10 font-medium text-primary"
														: "text-muted-foreground hover:bg-muted hover:text-foreground",
												)}
												preload="intent"
											>
												<menuItem.icon
													className={cn(
														"size-4 shrink-0",
														menuItem.isActive
															? "text-primary"
															: "text-muted-foreground",
													)}
												/>
												<span>{menuItem.label}</span>
											</Link>
										</li>
									))}
									{!loaded && (
										<li>
											<Skeleton className="h-10 w-full rounded-lg" />
										</li>
									)}
								</ul>
							</div>
						))}
					</nav>
				</div>

				{/* Desktop: Footer with user menu and credits */}
				<div
					className={cn("mt-auto mb-0 hidden", {
						"md:block": useSidebarLayout,
					})}
				>
					<div className="border-t border-border p-4">
						<div className="flex items-center gap-3">
							<div className="min-w-0 flex-1">
								<UserMenu showUserName />
							</div>
							<div className="shrink-0">
								<NotificationBell />
							</div>
						</div>
					</div>
					<div className="border-t border-border px-4 py-3">
						<p className="flex items-center justify-center gap-1 text-xs text-muted-foreground/60">
							<span>Made with</span>
							<HeartIcon className="size-3 fill-current text-red-500" />
							<span>by</span>
							<a
								href="https://abiroot.com/?utm_source=libancom&utm_medium=app&utm_campaign=footer"
								target="_blank"
								rel="noopener noreferrer"
								className="font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
							>
								abiroot.com
							</a>
						</p>
					</div>
				</div>
			</div>
		</nav>
	);
}
