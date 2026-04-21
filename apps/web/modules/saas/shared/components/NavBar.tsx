"use client";
import { config } from "@repo/config";
import { useSession } from "@saas/auth/client";
import {
	useActiveOrganization,
	useCanAccess,
	usePermissionScope,
} from "@saas/organizations/client";
import { InstallAppButton } from "@shared/components/InstallAppButton";
import { Logo } from "@shared/components/Logo";
import { useAppBadge } from "@shared/hooks/use-app-badge";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import type { LucideIcon } from "lucide-react";
import {
	AlertTriangleIcon,
	BanknoteIcon,
	BotIcon,
	ChevronDownIcon,
	ClipboardListIcon,
	DollarSignIcon,
	EyeIcon,
	HardHatIcon,
	HeartIcon,
	LayoutDashboardIcon,
	ListIcon,
	MessageSquareIcon,
	OctagonXIcon,
	PackageIcon,
	RadioTowerIcon,
	SettingsIcon,
	ShieldIcon,
	UsersIcon,
	WifiIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { OrganizationSelect } from "../../organizations/components/OrganizationSelect";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

interface NavItem {
	label: string;
	href: string;
	icon: LucideIcon;
	isActive: boolean;
	badge?: number;
}

interface NavGroup {
	id: string;
	label: string;
	icon: LucideIcon;
	items: NavItem[];
}

export function NavBar() {
	const location = useLocation();
	const pathname = location.pathname;
	const { user } = useSession();
	const { activeOrganization, loaded, isOrganizationAdmin, permissions } =
		useActiveOrganization();
	const hasPermission = useCanAccess();
	const getScope = usePermissionScope();
	const { useSidebarLayout } = config.ui.saas;
	const organizationId = useOrganizationId();

	const { data: statsData } = useQuery(
		organizationId
			? orpc.billing.payments.stats.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["billing", "stats"]),
	);
	const unreviewedCount = statsData?.unreviewedCount ?? 0;

	useAppBadge(unreviewedCount);

	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}`
		: "/app";

	const { dashboard, navGroups } = useMemo(() => {
		if (!activeOrganization) {
			return {
				dashboard: null as NavItem | null,
				navGroups: [] as NavGroup[],
			};
		}

		// Wait for permissions to load for non-admins — prevents flash of unauthorized nav items
		if (!isOrganizationAdmin && Object.keys(permissions).length === 0) {
			return {
				dashboard: null as NavItem | null,
				navGroups: [] as NavGroup[],
			};
		}

		const customersScope = getScope("customers", "read");
		const canReadCustomers = customersScope !== null;
		const canReadEmployees = hasPermission("employees", "read");
		const canReadTasks = hasPermission("tasks", "read");
		const canReadAiAgents = hasPermission("aiAgents", "read");
		const canReadWatchers = hasPermission("watchers", "read");
		const canViewBilling = hasPermission("billing", "view");
		const canManageBilling = hasPermission("billing", "manage");
		const canCollectBilling = hasPermission("billing", "collect");

		const at = (href: string) =>
			pathname === href || pathname === `${href}/`;
		const under = (href: string) =>
			pathname === href || pathname.startsWith(`${href}/`);

		const hasFullCustomerAccess =
			isOrganizationAdmin || customersScope === "all";

		const dashboardItem: NavItem | null = hasFullCustomerAccess
			? {
					label: "Dashboard",
					href: basePath,
					icon: LayoutDashboardIcon,
					isActive:
						pathname === basePath || pathname === `${basePath}/`,
				}
			: null;

		// Active at /customers and /customers/:id but NOT sub-pages
		const customersActive =
			under(`${basePath}/customers`) &&
			!under(`${basePath}/customers/plans`) &&
			!under(`${basePath}/customers/stations`) &&
			!under(`${basePath}/customers/access-points`);

		const groups: NavGroup[] = [
			// Subscribers — requires customers:read (any scope)
			...(canReadCustomers
				? [
						{
							id: "subscribers",
							label: "Subscribers",
							icon: UsersIcon,
							items: [
								{
									label: hasFullCustomerAccess
										? "All Customers"
										: "My Customers",
									href: `${basePath}/customers`,
									icon: UsersIcon,
									isActive: customersActive,
								},
								// Plans, Stations, Access Points only for full access
								...(hasFullCustomerAccess
									? [
											{
												label: "Service Plans",
												href: `${basePath}/customers/plans`,
												icon: PackageIcon,
												isActive: under(
													`${basePath}/customers/plans`,
												),
											},
											{
												label: "Stations",
												href: `${basePath}/customers/stations`,
												icon: RadioTowerIcon,
												isActive: under(
													`${basePath}/customers/stations`,
												),
											},
											{
												label: "Access Points",
												href: `${basePath}/customers/access-points`,
												icon: WifiIcon,
												isActive: under(
													`${basePath}/customers/access-points`,
												),
											},
										]
									: []),
							],
						},
					]
				: []),
			// Billing — visible to anyone with billing:view or billing:collect
			...(canViewBilling || canCollectBilling
				? [
						{
							id: "billing",
							label: "Billing",
							icon: DollarSignIcon,
							items: [
								// Dashboard, Payments, Stopped, Collections, Reports — requires billing:manage
								...(canManageBilling
									? [
											{
												label: "Dashboard",
												href: `${basePath}/billing`,
												icon: DollarSignIcon,
												isActive:
													at(`${basePath}/billing`) &&
													!under(
														`${basePath}/billing/collect`,
													) &&
													!under(
														`${basePath}/billing/payments`,
													) &&
													!under(
														`${basePath}/billing/stopped`,
													),
											},
										]
									: []),
								{
									label: "Unpaid Bills",
									href: `${basePath}/billing/collect`,
									icon: BanknoteIcon,
									isActive: under(
										`${basePath}/billing/collect`,
									),
								},
								...(canManageBilling
									? [
											{
												label: "Paid Bills",
												href: `${basePath}/billing/payments`,
												icon: ListIcon,
												isActive: under(
													`${basePath}/billing/payments`,
												),
												badge: unreviewedCount,
											},
											{
												label: "Stopped",
												href: `${basePath}/billing/stopped`,
												icon: OctagonXIcon,
												isActive: under(
													`${basePath}/billing/stopped`,
												),
											},
											{
												label: "Collections",
												href: `${basePath}/billing/collections`,
												icon: BanknoteIcon,
												isActive: under(
													`${basePath}/billing/collections`,
												),
											},
											{
												label: "Reports",
												href: `${basePath}/billing/reports`,
												icon: DollarSignIcon,
												isActive: under(
													`${basePath}/billing/reports`,
												),
											},
										]
									: []),
							],
						},
					]
				: []),
			// Operations — requires at least one of employees/tasks read
			...(canReadEmployees || canReadTasks
				? [
						{
							id: "operations",
							label: "Operations",
							icon: ClipboardListIcon,
							items: [
								...(canReadEmployees
									? [
											{
												label: "Employees",
												href: `${basePath}/employees`,
												icon: HardHatIcon,
												isActive: under(
													`${basePath}/employees`,
												),
											},
										]
									: []),
								...(canReadTasks
									? [
											{
												label: "Tasks",
												href: `${basePath}/tasks`,
												icon: ClipboardListIcon,
												isActive: under(
													`${basePath}/tasks`,
												),
											},
										]
									: []),
							],
						},
					]
				: []),
			// Intelligence — requires aiAgents, watchers, or tasks read
			...(canReadAiAgents || canReadWatchers || canReadTasks
				? [
						{
							id: "intelligence",
							label: "Intelligence",
							icon: BotIcon,
							items: [
								...(canReadAiAgents
									? [
											{
												label: "AI Agents",
												href: `${basePath}/ai-agents`,
												icon: BotIcon,
												isActive: under(
													`${basePath}/ai-agents`,
												),
											},
											{
												label: "Conversations",
												href: `${basePath}/conversations`,
												icon: MessageSquareIcon,
												isActive: under(
													`${basePath}/conversations`,
												),
											},
										]
									: []),
								...(canReadTasks
									? [
											{
												label: "Escalations",
												href: `${basePath}/escalations`,
												icon: AlertTriangleIcon,
												isActive: under(
													`${basePath}/escalations`,
												),
											},
										]
									: []),
								...(canReadWatchers
									? [
											{
												label: "Watchers",
												href: `${basePath}/watchers`,
												icon: EyeIcon,
												isActive: under(
													`${basePath}/watchers`,
												),
											},
										]
									: []),
							],
						},
					]
				: []),
		];

		return { dashboard: dashboardItem, navGroups: groups };
	}, [
		activeOrganization,
		basePath,
		pathname,
		permissions,
		isOrganizationAdmin,
		hasPermission,
		getScope,
		unreviewedCount,
	]);

	const bottomLinks: NavItem[] = useMemo(() => {
		const under = (href: string) =>
			pathname === href || pathname.startsWith(`${href}/`);
		const links: NavItem[] = [];
		if (activeOrganization && isOrganizationAdmin) {
			links.push({
				label: "Settings",
				href: `${basePath}/settings`,
				icon: SettingsIcon,
				isActive: under(`${basePath}/settings`),
			});
		}
		if (user?.role === "admin") {
			links.push({
				label: "Admin",
				href: "/app/admin",
				icon: ShieldIcon,
				isActive: under("/app/admin"),
			});
		}
		return links;
	}, [
		activeOrganization,
		basePath,
		user?.role,
		pathname,
		isOrganizationAdmin,
	]);

	// ── Accordion state ─────────────────────────────────────────────

	const [openGroups, setOpenGroups] = useState<string[]>([]);

	// Auto-expand groups that have an active item
	useEffect(() => {
		const shouldOpen = navGroups
			.filter((g) => g.items.some((i) => i.isActive))
			.map((g) => g.id);
		if (shouldOpen.length > 0) {
			setOpenGroups((prev) => {
				const merged = new Set([...prev, ...shouldOpen]);
				return Array.from(merged);
			});
		}
	}, [navGroups]);

	function toggleGroup(groupId: string) {
		setOpenGroups((prev) =>
			prev.includes(groupId)
				? prev.filter((id) => id !== groupId)
				: [...prev, groupId],
		);
	}

	// ── Flat list for mobile ────────────────────────────────────────

	const flatMenuItems = useMemo(() => {
		const items: NavItem[] = [];
		if (dashboard) {
			items.push(dashboard);
		}
		for (const group of navGroups) {
			for (const item of group.items) {
				items.push(item);
			}
		}
		for (const link of bottomLinks) {
			items.push(link);
		}
		return items;
	}, [dashboard, navGroups, bottomLinks]);

	// ── Render ──────────────────────────────────────────────────────

	return (
		<nav
			className={cn("w-full border-b border-border/50 md:border-b-0", {
				"w-full md:fixed md:top-0 md:left-0 md:h-full md:w-[280px] md:border-r md:border-border/50 md:bg-background":
					useSidebarLayout,
			})}
		>
			<div
				className={cn("container max-w-6xl px-3 py-3 sm:px-6 sm:py-4", {
					"md:flex md:h-full md:flex-col md:px-4 md:pt-6 md:pb-0":
						useSidebarLayout,
				})}
			>
				{/* Header */}
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div
						className={cn("flex items-center gap-4 md:gap-2", {
							"md:flex md:w-full md:flex-col md:items-stretch":
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
								<OrganizationSelect
									className={cn({
										"md:-mx-2 md:mt-2": useSidebarLayout,
									})}
								/>
							)}
					</div>

					<div
						className={cn(
							"mr-0 ml-auto flex items-center justify-end gap-2",
							{ "md:hidden": useSidebarLayout },
						)}
					>
						<InstallAppButton />
						<NotificationBell />
						<UserMenu />
					</div>
				</div>

				{/* Mobile: Horizontal scrollable menu */}
				<ul
					className={cn(
						"no-scrollbar -mx-3 -mb-3 mt-4 flex list-none items-center justify-start gap-1 overflow-x-auto px-3 pb-0 text-sm sm:-mx-6 sm:-mb-4 sm:mt-6 sm:px-6",
						{ "md:hidden": useSidebarLayout },
					)}
				>
					{flatMenuItems.map((item) => (
						<li key={item.href + item.label}>
							<NavLink item={item} size="mobile" />
						</li>
					))}
					{!loaded && (
						<>
							<li>
								<Skeleton className="h-9 w-24 rounded-lg" />
							</li>
							<li>
								<Skeleton className="h-9 w-28 rounded-lg" />
							</li>
						</>
					)}
				</ul>

				{/* Desktop: Sidebar */}
				<div
					className={cn("hidden flex-1 overflow-y-auto py-4", {
						"md:block": useSidebarLayout,
					})}
				>
					<div className="space-y-1">
						{/* Dashboard */}
						{dashboard && (
							<NavLink item={dashboard} size="desktop" />
						)}

						{/* Accordion groups */}
						{navGroups.map((group) => {
							const isOpen = openGroups.includes(group.id);
							const groupHasActive = group.items.some(
								(i) => i.isActive,
							);

							return (
								<div key={group.id}>
									<button
										type="button"
										onClick={() => toggleGroup(group.id)}
										className={cn(
											"flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
											groupHasActive
												? "font-medium text-foreground"
												: "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
										)}
									>
										<group.icon
											className={cn(
												"size-4 shrink-0",
												groupHasActive
													? "text-foreground"
													: "text-muted-foreground",
											)}
										/>
										<span className="flex-1 text-left">
											{group.label}
										</span>
										<ChevronDownIcon
											className={cn(
												"size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
												isOpen && "rotate-180",
											)}
										/>
									</button>

									{isOpen && (
										<ul className="ml-4 mt-0.5 space-y-0.5 border-l border-border/40 pl-3">
											{group.items.map((item) => (
												<li key={item.href}>
													<NavLink
														item={item}
														size="sub"
													/>
												</li>
											))}
										</ul>
									)}
								</div>
							);
						})}

						<div className="pt-3" />

						{/* Bottom links */}
						{bottomLinks.map((link) => (
							<NavLink
								key={link.href}
								item={link}
								size="desktop"
							/>
						))}

						{!loaded && (
							<Skeleton className="h-9 w-full rounded-lg" />
						)}
					</div>
				</div>

				{/* Desktop: Footer */}
				<div
					className={cn("mt-auto mb-0 hidden", {
						"md:block": useSidebarLayout,
					})}
				>
					<div className="border-t border-border/50 p-4">
						<div className="flex items-center gap-3">
							<div className="min-w-0 flex-1">
								<UserMenu showUserName />
							</div>
							<div className="shrink-0">
								<InstallAppButton />
							</div>
							<div className="shrink-0">
								<NotificationBell />
							</div>
						</div>
					</div>
					<div className="border-t border-border/50 px-4 py-3">
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
						<p className="mt-1 text-center text-[10px] text-muted-foreground/40">
							v1.0.0
						</p>
					</div>
				</div>
			</div>
		</nav>
	);
}

// ─── NavLink ────────────────────────────────────────────────────────

const mobileCls =
	"flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 transition-colors";
const desktopCls =
	"flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all";
const subCls =
	"flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-all";
const activeCls = "bg-card font-medium text-foreground shadow-sm";
const inactiveCls =
	"text-muted-foreground hover:bg-muted/40 hover:text-foreground";

function NavLink({
	item,
	size,
}: {
	item: NavItem;
	size: "mobile" | "desktop" | "sub";
}) {
	const base =
		size === "mobile" ? mobileCls : size === "sub" ? subCls : desktopCls;
	const iconSize = size === "sub" ? "size-3.5" : "size-4";

	const cls = cn(base, item.isActive ? activeCls : inactiveCls);

	return (
		<Link
			to={item.href}
			activeOptions={{ exact: true }}
			activeProps={{ className: cls }}
			inactiveProps={{ className: cls }}
			preload="intent"
		>
			<item.icon
				className={cn(
					iconSize,
					"shrink-0",
					item.isActive ? "text-foreground" : "text-muted-foreground",
				)}
			/>
			<span className="flex-1">{item.label}</span>
			{item.badge != null && item.badge > 0 && (
				<span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground tabular-nums">
					{item.badge}
				</span>
			)}
		</Link>
	);
}
