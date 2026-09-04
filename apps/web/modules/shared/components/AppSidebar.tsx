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
	useSidebar,
} from "@ui/components/sidebar";
import {
	AlertTriangleIcon,
	BanknoteIcon,
	BotIcon,
	BoxesIcon,
	EyeIcon,
	HandshakeIcon,
	HardHatIcon,
	HomeIcon,
	LineChartIcon,
	type LucideIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	PackageIcon,
	PanelLeftCloseIcon,
	PanelLeftIcon,
	RadioTowerIcon,
	ReceiptIcon,
	SearchIcon,
	SettingsIcon,
	ShieldIcon,
	UserPlusIcon,
	UsersIcon,
	WrenchIcon,
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

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive navigation shell; the nav config and rendering are tightly coupled and splitting obscures the layout
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
	const { state, toggleSidebar } = useSidebar();
	const collapsed = state === "collapsed";

	// Live badges
	const { data: paymentStats } = useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "stats"]),
	);
	const unreviewedCount = paymentStats?.unreviewedCount ?? 0;

	const { data: installationStats } = useQuery(
		organizationId
			? orpc.installations.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["installations", "stats"]),
	);
	const pendingInstallations = installationStats?.pendingCount ?? 0;

	const { data: expenseStats } = useQuery(
		organizationId
			? orpc.expenses.stats.queryOptions({ input: { organizationId } })
			: disabledQuery(["expenses", "stats"]),
	);
	const pendingExpenses = expenseStats?.pendingCount ?? 0;

	const { data: stockStats } = useQuery(
		organizationId
			? orpc.stock.stats.queryOptions({ input: { organizationId } })
			: disabledQuery(["stock", "stats"]),
	);
	const pendingStockRefunds = stockStats?.pendingRefundCount ?? 0;

	// Recovered equipment a worker submitted and nobody has reviewed. Only the
	// approvers can act on it, so only they get the badge.
	const canApproveInstallations = hasPermission("installations", "approve");
	const { data: taskStats } = useQuery(
		organizationId && hasPermission("tasks", "read")
			? orpc.tasks.stats.queryOptions({ input: { organizationId } })
			: disabledQuery(["tasks", "stats"]),
	);
	const pendingRecoveredItems = canApproveInstallations
		? (taskStats?.pendingRecoveredItems ?? 0)
		: 0;

	const { data: setupRequests } = useQuery(
		organizationId
			? orpc.customers.setupRequests.list.queryOptions({
					input: { organizationId, status: "PENDING" },
				})
			: disabledQuery(["customers", "setupRequests"]),
	);
	const pendingNewCustomers = setupRequests?.total ?? 0;

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
		const canReadDealers = hasPermission("dealers", "read");
		const canReadInventory = hasPermission("inventory", "read");
		const canReadInstallations = hasPermission("installations", "read");
		const canReadExpenses = hasPermission("expenses", "read");
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
					// The owner's landing surface: one page answering whether
					// the business made money. Sits above the operational
					// billing tabs on purpose — it is the question that gets
					// asked daily, and it used to have no page at all.
					...(canViewBilling
						? [
								{
									label: "Money",
									to: `${basePath}/insights`,
									icon: LineChartIcon,
								},
							]
						: []),
					// Dealer money sits next to Money on purpose: "what do the
					// dealers owe me" is the owner's second daily question.
					...(canReadDealers
						? [
								{
									label: "Dealers",
									to: `${basePath}/dealers`,
									icon: HandshakeIcon,
								},
							]
						: []),
					// And "what did we spend" is the third. Worker claims are
					// one section of it, so the pending badge stays.
					...(canReadExpenses
						? [
								{
									label: "Spending",
									to: `${basePath}/expenses`,
									icon: ReceiptIcon,
									badge: pendingExpenses,
								},
							]
						: []),
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
									label: "New Customers",
									to: `${basePath}/customers/approvals`,
									icon: UserPlusIcon,
									badge: pendingNewCustomers,
								},
								{
									label: "Plans",
									to: `${basePath}/customers/plans`,
									icon: PackageIcon,
								},
								{
									label: "Network",
									to: `${basePath}/customers/network`,
									icon: RadioTowerIcon,
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

		if (
			canReadEmployees ||
			canReadTasks ||
			canReadInventory ||
			canReadInstallations ||
			canReadExpenses
		) {
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
					badge: pendingRecoveredItems,
				});
			}
			if (canReadInventory) {
				items.push({
					label: "Stock",
					to: `${basePath}/stock`,
					icon: BoxesIcon,
					badge: pendingStockRefunds,
				});
			}
			if (canReadInstallations) {
				items.push({
					label: "Installations",
					to: `${basePath}/installations`,
					icon: WrenchIcon,
					badge: pendingInstallations,
				});
			}
			groups.push({ id: "operations", label: "Operations", items });
		}

		if (canReadAiAgents || canReadTasks) {
			const items: NavItem[] = [];
			if (canReadAiAgents) {
				items.push(
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
				);
			}
			if (canReadTasks) {
				items.push({
					label: "Escalations",
					to: `${basePath}/escalations`,
					icon: AlertTriangleIcon,
				});
			}
			groups.push({ id: "ai", label: "AI", items });
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

		if (isOrganizationAdmin) {
			groups.push({
				id: "infrastructure",
				label: "Infrastructure",
				items: [
					{
						label: "iRadius",
						to: `${basePath}/iradius`,
						icon: RadioTowerIcon,
					},
				],
			});
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
		pendingInstallations,
		pendingExpenses,
		pendingNewCustomers,
		pendingStockRefunds,
		pendingRecoveredItems,
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
				{collapsed ? (
					<>
						<Link
							to="/app"
							className="mx-auto flex size-8 items-center justify-center"
							aria-label="LibanCom home"
						>
							{/* Icon-only mark; wordmark overflows the 48px rail */}
							<Logo size="sm" withLabel={false} />
						</Link>
						<SidebarMenuButton
							tooltip="Expand sidebar"
							onClick={toggleSidebar}
							aria-label="Expand sidebar"
						>
							<PanelLeftIcon />
						</SidebarMenuButton>
						<SidebarMenuButton
							tooltip="Search (⌘K)"
							onClick={openPalette}
							aria-label="Open command palette"
						>
							<SearchIcon />
						</SidebarMenuButton>
					</>
				) : (
					<>
						{/* Row 1: wordmark + collapse button */}
						<div className="flex items-center justify-between gap-2 px-1">
							<Link
								to="/app"
								className="shrink-0"
								aria-label="LibanCom home"
							>
								<Logo size="sm" />
							</Link>
							<button
								type="button"
								onClick={toggleSidebar}
								aria-label="Collapse sidebar"
								className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							>
								<PanelLeftCloseIcon className="size-4" />
							</button>
						</div>

						{/* Row 2: full-width org switcher */}
						{config.organizations.enable &&
							!config.organizations.hideOrganization && (
								<div className="w-full">
									<OrganizationSelect />
								</div>
							)}

						{/* Row 3: search trigger */}
						<button
							type="button"
							onClick={openPalette}
							className="flex h-9 w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent"
						>
							<SearchIcon className="size-4 shrink-0" />
							<span className="flex-1 text-left">Search…</span>
							<kbd className="font-mono text-[10px] text-muted-foreground/70">
								⌘K
							</kbd>
						</button>
					</>
				)}
			</SidebarHeader>

			<SidebarContent>
				{sections.map((section) => (
					<SidebarGroup key={section.id} className="px-2 py-1">
						<SidebarGroupLabel className="h-6 text-[11px] uppercase tracking-wider opacity-60">
							{section.label}
						</SidebarGroupLabel>
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
											{item.badge != null && (
												<SidebarMenuBadge
													count={item.badge}
												/>
											)}
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}

				{bottomItems.length > 0 && (
					<SidebarGroup className="mt-auto px-2 py-1">
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
				{collapsed ? (
					<div className="flex flex-col items-center gap-1">
						<NotificationBell />
						<UserMenu />
					</div>
				) : (
					<div className="flex items-center gap-1">
						<div className="min-w-0 flex-1">
							<UserMenu showUserName />
						</div>
						<NotificationBell />
					</div>
				)}
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
