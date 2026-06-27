"use client";

import { useSession } from "@saas/auth/client";
import {
	useActiveOrganization,
	useCanAccess,
} from "@saas/organizations/client";
import { orpc } from "@shared/lib/orpc";
import { setTheme } from "@shared/stores/theme-store";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@ui/components/command";
import {
	AlertTriangleIcon,
	BanknoteIcon,
	BotIcon,
	EyeIcon,
	HardHatIcon,
	HomeIcon,
	MegaphoneIcon,
	MessageSquareIcon,
	MonitorIcon,
	MoonIcon,
	PackageIcon,
	PlusIcon,
	RadioTowerIcon,
	SettingsIcon,
	ShieldIcon,
	SunIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import {
	createContext,
	type PropsWithChildren,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

interface CommandPaletteContextValue {
	open: () => void;
	close: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
	open: () => {},
	close: () => {},
});

export function useCommandPalette() {
	return use(CommandPaletteContext);
}

/**
 * Global command palette mounted at the app root.
 *
 * Triggered by ⌘K / Ctrl+K, or by any component calling `useCommandPalette().open()`.
 *
 * Three sections:
 *   1. Navigate — links to every nav destination (permission-aware)
 *   2. Quick actions — context-aware shortcuts (theme toggle, navigate to settings, etc.)
 *   3. Search records — debounced fan-out across customers/employees/tasks/conversations/broadcasts
 *      backed by `orpc.shared.search`
 */
export function CommandPaletteProvider({ children }: PropsWithChildren) {
	const [isOpen, setIsOpen] = useState(false);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);

	// Global ⌘K / Ctrl+K shortcut
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setIsOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const ctx = useMemo<CommandPaletteContextValue>(
		() => ({ open, close }),
		[open, close],
	);

	return (
		<CommandPaletteContext.Provider value={ctx}>
			{children}
			<CommandDialog open={isOpen} onOpenChange={setIsOpen}>
				<PaletteBody onClose={close} />
			</CommandDialog>
		</CommandPaletteContext.Provider>
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive command-palette body; length is repeated CommandGroup JSX, splitting would obscure data flow
function PaletteBody({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();
	const { user } = useSession();
	const { activeOrganization, isOrganizationAdmin } = useActiveOrganization();
	const hasPermission = useCanAccess();
	const [query, setQuery] = useState("");

	const basePath = activeOrganization
		? `/app/${activeOrganization.slug}`
		: "/app";

	const go = useCallback(
		(to: string) => {
			onClose();
			// Defer navigation a tick so the dialog close animation can start
			setTimeout(() => navigate({ to }), 0);
		},
		[navigate, onClose],
	);

	const runAction = useCallback(
		(action: () => void) => {
			onClose();
			setTimeout(action, 0);
		},
		[onClose],
	);

	// Debounced server search
	const trimmedQuery = query.trim();
	const enableSearch = trimmedQuery.length >= 2 && activeOrganization != null;

	const { data: searchData, isLoading: searchLoading } = useQuery({
		...orpc.shared.search.queryOptions({
			input: {
				organizationId: activeOrganization?.id ?? "",
				organizationSlug: activeOrganization?.slug ?? undefined,
				q: trimmedQuery,
				limitPerType: 5,
			},
		}),
		enabled: enableSearch,
		staleTime: 30_000,
	});

	const searchResults = useMemo(
		() => searchData?.results ?? [],
		[searchData],
	);
	const grouped = useMemo(() => {
		const groups = {
			customer: [] as typeof searchResults,
			employee: [] as typeof searchResults,
			task: [] as typeof searchResults,
			conversation: [] as typeof searchResults,
			broadcast: [] as typeof searchResults,
		};
		for (const r of searchResults) {
			groups[r.type].push(r);
		}
		return groups;
	}, [searchResults]);

	// Navigation items — permission-gated
	const navItems = useMemo(() => {
		if (!activeOrganization) {
			return [];
		}
		const items: {
			label: string;
			to: string;
			icon: typeof HomeIcon;
			sub?: string;
		}[] = [{ label: "Dashboard", to: basePath, icon: HomeIcon }];
		if (hasPermission("customers", "read")) {
			items.push({
				label: "Customers",
				to: `${basePath}/customers`,
				icon: UsersIcon,
			});
			if (isOrganizationAdmin) {
				items.push({
					label: "Service Plans",
					to: `${basePath}/customers/plans`,
					icon: PackageIcon,
				});
				items.push({
					label: "Network",
					to: `${basePath}/customers/network`,
					icon: RadioTowerIcon,
				});
			}
		}
		if (
			hasPermission("billing", "view") ||
			hasPermission("billing", "collect")
		) {
			items.push({
				label: "Billing",
				to: `${basePath}/billing`,
				icon: BanknoteIcon,
			});
		}
		if (hasPermission("employees", "read")) {
			items.push({
				label: "Employees",
				to: `${basePath}/employees`,
				icon: HardHatIcon,
			});
		}
		if (hasPermission("tasks", "read")) {
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
		if (hasPermission("aiAgents", "read")) {
			items.push({
				label: "AI Agents",
				to: `${basePath}/ai-agents`,
				icon: BotIcon,
			});
			items.push({
				label: "Conversations",
				to: `${basePath}/conversations`,
				icon: MessageSquareIcon,
			});
		}
		if (hasPermission("watchers", "read")) {
			items.push({
				label: "Watchers",
				to: `${basePath}/watchers`,
				icon: EyeIcon,
			});
		}
		if (hasPermission("marketing", "read")) {
			items.push({
				label: "Broadcasts",
				to: `${basePath}/marketing`,
				icon: MegaphoneIcon,
			});
		}
		if (isOrganizationAdmin) {
			items.push({
				label: "Settings",
				to: `${basePath}/settings`,
				icon: SettingsIcon,
			});
		}
		if (user?.role === "admin") {
			items.push({
				label: "Platform Admin",
				to: "/app/admin",
				icon: ShieldIcon,
			});
		}
		return items;
	}, [
		activeOrganization,
		basePath,
		hasPermission,
		isOrganizationAdmin,
		user?.role,
	]);

	return (
		<>
			<CommandInput
				placeholder="Search customers, employees, tasks, conversations…"
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				{!searchLoading && trimmedQuery.length >= 2 && (
					<CommandEmpty>No results found.</CommandEmpty>
				)}

				{/* Search results */}
				{grouped.customer.length > 0 && (
					<CommandGroup heading="Customers">
						{grouped.customer.map((r) => (
							<CommandItem
								key={r.id}
								value={`customer-${r.id}-${r.label}`}
								onSelect={() => go(r.link)}
							>
								<UsersIcon className="size-4" />
								<span className="flex-1">{r.label}</span>
								{r.sub && (
									<span className="text-xs text-muted-foreground">
										{r.sub}
									</span>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{grouped.employee.length > 0 && (
					<CommandGroup heading="Employees">
						{grouped.employee.map((r) => (
							<CommandItem
								key={r.id}
								value={`employee-${r.id}-${r.label}`}
								onSelect={() => go(r.link)}
							>
								<HardHatIcon className="size-4" />
								<span className="flex-1">{r.label}</span>
								{r.sub && (
									<span className="text-xs text-muted-foreground">
										{r.sub}
									</span>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{grouped.task.length > 0 && (
					<CommandGroup heading="Tasks">
						{grouped.task.map((r) => (
							<CommandItem
								key={r.id}
								value={`task-${r.id}-${r.label}`}
								onSelect={() => go(r.link)}
							>
								<AlertTriangleIcon className="size-4" />
								<span className="flex-1">{r.label}</span>
								{r.sub && (
									<span className="text-xs text-muted-foreground">
										{r.sub}
									</span>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{grouped.conversation.length > 0 && (
					<CommandGroup heading="Conversations">
						{grouped.conversation.map((r) => (
							<CommandItem
								key={r.id}
								value={`conv-${r.id}-${r.label}`}
								onSelect={() => go(r.link)}
							>
								<MessageSquareIcon className="size-4" />
								<span className="flex-1">{r.label}</span>
								{r.sub && (
									<span className="text-xs text-muted-foreground">
										{r.sub}
									</span>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{grouped.broadcast.length > 0 && (
					<CommandGroup heading="Broadcasts">
						{grouped.broadcast.map((r) => (
							<CommandItem
								key={r.id}
								value={`bcast-${r.id}-${r.label}`}
								onSelect={() => go(r.link)}
							>
								<MegaphoneIcon className="size-4" />
								<span className="flex-1">{r.label}</span>
								{r.sub && (
									<span className="text-xs text-muted-foreground">
										{r.sub}
									</span>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}

				{searchResults.length > 0 && <CommandSeparator />}

				{/* Quick actions */}
				<CommandGroup heading="Quick actions">
					{hasPermission("customers", "write") && (
						<CommandItem
							value="action-add-customer"
							onSelect={() =>
								go(`${basePath}/customers?action=create`)
							}
						>
							<UserPlusIcon className="size-4" />
							<span className="flex-1">Add customer</span>
							<kbd className="font-mono text-[10px] text-muted-foreground">
								⇧⌘N
							</kbd>
						</CommandItem>
					)}
					{hasPermission("tasks", "write") && (
						<CommandItem
							value="action-add-task"
							onSelect={() =>
								go(`${basePath}/tasks?action=create`)
							}
						>
							<PlusIcon className="size-4" />
							<span className="flex-1">Create task</span>
							<kbd className="font-mono text-[10px] text-muted-foreground">
								⇧⌘T
							</kbd>
						</CommandItem>
					)}
					<CommandItem
						value="action-theme-light"
						onSelect={() => runAction(() => setTheme("light"))}
					>
						<SunIcon className="size-4" />
						<span>Light theme</span>
					</CommandItem>
					<CommandItem
						value="action-theme-dark"
						onSelect={() => runAction(() => setTheme("dark"))}
					>
						<MoonIcon className="size-4" />
						<span>Dark theme</span>
					</CommandItem>
					<CommandItem
						value="action-theme-system"
						onSelect={() => runAction(() => setTheme("system"))}
					>
						<MonitorIcon className="size-4" />
						<span>System theme</span>
					</CommandItem>
				</CommandGroup>

				<CommandSeparator />

				{/* Navigation */}
				<CommandGroup heading="Navigate">
					{navItems.map((item) => (
						<CommandItem
							key={item.to}
							value={`nav-${item.to}-${item.label}`}
							onSelect={() => go(item.to)}
						>
							<item.icon className="size-4" />
							<span>{item.label}</span>
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</>
	);
}
