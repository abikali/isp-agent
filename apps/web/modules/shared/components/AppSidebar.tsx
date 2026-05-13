"use client";

import { config } from "@repo/config";
import { useSession } from "@saas/auth/client";
import {
	useActiveOrganization,
	useCanAccess,
	usePermissionScope,
} from "@saas/organizations/client";
import { OrganizationSelect } from "@saas/organizations/components/OrganizationSelect";
import { NotificationBell } from "@saas/shared/components/NotificationBell";
import { UserMenu } from "@saas/shared/components/UserMenu";
import { Logo } from "@shared/components/Logo";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@ui/components/sidebar";
import {
	AlertTriangleIcon,
	BanknoteIcon,
	BotIcon,
	EyeIcon,
	HardHatIcon,
	HomeIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	PackageIcon,
	RadioTowerIcon,
	SearchIcon,
	SettingsIcon,
	ShieldIcon,
	UsersIcon,
	WifiIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useCommandPalette } from "./CommandPalette";

interface NavItem {
	label: string;
	to: string;
	icon: LucideIcon;
	exact?: boolean;
	badge?: number;
}

interface NavSection {
	id: string;
	label: string;
	items: NavItem[];
}

export function AppSidebar() {
	const location = useLocation();
	const pathname = location.pathname;
	const { user } = useSession();
	const { activeOrganization, isOrganizationAdmin, permissions } =
		useActiveOrganization();
	const hasPermission = useCanAccess();
	const getScope = usePermissionScope();
	const organizationId = useOrganizationId();
	const { open: openPalette } = useCommandPalette();

	// Live badges
	const { data: paymentStats } = useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "stats"]),
	);
	const unreviewedCount = paymentStats?.unreviewedCount ?? 0;

	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}`
		: "/app";

	const sections = useMemo<NavSection[]>(() => {
		if (!activeOrganization) {
			return [];
		}
		// Wait for permissions to load for non-admins
		if (!isOrganizationAdmin && Object.keys(permissions).length === 0) {
			return [];
		}

		const customersScope = getScope("customers", "read");
		const canReadCustomers = customersScope !== null;
		const canReadEmployees = hasPermission("employees", "read");
		const canReadTasks = hasPermission("tasks", "read");
		const canReadAiAgents = hasPermission("aiAgents", "read");
		const canReadWatchers = hasPermission("watchers", "read");
		const canReadMarketing = hasPermission("marketing", "read");
		const canViewBilling = hasPermission("billing", "view");
		const canCollectBilling = hasPermission("billing", "collect");
		const hasFullCustomerAccess =
			isOrganizationAdmin || customersScope === "all";

		const groups: NavSection[] = [
			{
				id: "workspace",
				label: "Workspace",
				items: [
					{
						label: "Dashboard",
						to: basePath,
						icon: HomeIcon,
						exact: true,
					},
				],
			},
		];

		if (canReadCustomers) {
			groups.push({
				id: "subscribers",
				label: "Subscribers",
				items: [
					{
						label: hasFullCustomerAccess
							? "Customers"
							: "My Customers",
						to: `${basePath}/customers`,
						icon: UsersIcon,
					},
					...(hasFullCustomerAccess
						? [
								{
									label: "Plans",
									to: `${basePath}/customers/plans`,
									icon: PackageIcon,
								},
								{
									label: "Stations",
									to: `${basePath}/customers/stations`,
									icon: RadioTowerIcon,
								},
								{
									label: "Access Points",
									to: `${basePath}/customers/access-points`,
									icon: WifiIcon,
								},
							]
						: []),
				],
			});
		}

		if (canViewBilling || canCollectBilling) {
			groups.push({
				id: "billing",
				label: "Billing",
				items: [
					{
						label: "Billing",
						to: `${basePath}/billing`,
						icon: BanknoteIcon,
						badge: unreviewedCount,
					},
				],
			});
		}

		if (canReadEmployees || canReadTasks) {
			const items: NavItem[] = [];
			if (canReadEmployees) {
				items.push({
					label: "Employees",
					to: `${basePath}/employees`,
					icon: HardHatIcon,
				});
			}
			if (canReadTasks) {
				items.push({
					label: "Tasks",
					to: `${basePath}/tasks`,
					icon: UsersIcon,
				});
				items.push({
					label: "Escalations",
					to: `${basePath}/escalations`,
					icon: AlertTriangleIcon,
				});
			}
			groups.push({ id: "operations", label: "Operations", items });
		}

		if (canReadAiAgents) {
			groups.push({
				id: "ai",
				label: "AI",
				items: [
					{
						label: "Agents",
						to: `${basePath}/ai-agents`,
						icon: BotIcon,
					},
					{
						label: "Conversations",
						to: `${basePath}/conversations`,
						icon: MessageSquareIcon,
					},
				],
			});
		}

		if (canReadMarketing || canReadWatchers) {
			const items: NavItem[] = [];
			if (canReadMarketing) {
				items.push({
					label: "Broadcasts",
					to: `${basePath}/marketing`,
					icon: MegaphoneIcon,
				});
			}
			if (canReadWatchers) {
				items.push({
					label: "Watchers",
					to: `${basePath}/watchers`,
					icon: EyeIcon,
				});
			}
			groups.push({ id: "growth", label: "Growth", items });
		}

		return groups;
	}, [
		activeOrganization,
		basePath,
		permissions,
		isOrganizationAdmin,
		hasPermission,
		getScope,
		unreviewedCount,
	]);

	const bottomItems = useMemo<NavItem[]>(() => {
		const items: NavItem[] = [];
		if (activeOrganization && isOrganizationAdmin) {
			items.push({
				label: "Settings",
				to: `${basePath}/settings`,
				icon: SettingsIcon,
			});
		}
		if (user?.role === "admin") {
			items.push({
				label: "Admin",
				to: "/app/admin",
				icon: ShieldIcon,
			});
		}
		return items;
	}, [activeOrganization, basePath, user?.role, isOrganizationAdmin]);

	const isActive = (href: string, exact?: boolean) => {
		if (exact) {
			return pathname === href || pathname === `${href}/`;
		}
		return pathname === href || pathname.startsWith(`${href}/`);
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader className="gap-2">
				<div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<Link to="/app" className="shrink-0">
						<Logo size="sm" />
					</Link>
					<div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
						{config.organizations.enable &&
							!config.organizations.hideOrganization && (
								<OrganizationSelect />
							)}
					</div>
				</div>

				{/* Search trigger */}
				<button
					type="button"
					onClick={openPalette}
					className="flex h-9 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
				>
					<SearchIcon className="size-4 shrink-0" />
					<span className="flex-1 text-left">Search…</span>
					<kbd className="font-mono text-[10px] text-muted-foreground/70">
						⌘K
					</kbd>
				</button>
				<SidebarMenuButton
					tooltip="Search"
					onClick={openPalette}
					className="hidden group-data-[collapsible=icon]:flex"
				>
					<SearchIcon />
				</SidebarMenuButton>
			</SidebarHeader>

			<SidebarContent>
				{sections.map((section) => (
					<SidebarGroup key={section.id}>
						<SidebarGroupLabel>{section.label}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{section.items.map((item) => {
									const active = isActive(
										item.to,
										item.exact,
									);
									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton
												asChild
												isActive={active}
												tooltip={item.label}
											>
												<Link
													to={item.to}
													preload="intent"
												>
													<item.icon />
													<span>{item.label}</span>
												</Link>
											</SidebarMenuButton>
											{item.badge != null &&
												item.badge > 0 && (
													<SidebarMenuBadge>
														{item.badge}
													</SidebarMenuBadge>
												)}
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}

				{bottomItems.length > 0 && (
					<SidebarGroup className="mt-auto">
						<SidebarGroupContent>
							<SidebarMenu>
								{bottomItems.map((item) => {
									const active = isActive(item.to);
									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton
												asChild
												isActive={active}
												tooltip={item.label}
											>
												<Link
													to={item.to}
													preload="intent"
												>
													<item.icon />
													<span>{item.label}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>

			<SidebarFooter>
				<div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
					<div className="min-w-0 flex-1 group-data-[collapsible=icon]:w-full">
						<UserMenu showUserName />
					</div>
					<NotificationBell />
				</div>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
