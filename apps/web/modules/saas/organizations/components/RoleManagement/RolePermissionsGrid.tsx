"use client";

import {
	isActionScoped,
	PERMISSION_GROUPS,
	type PermissionRecord,
	type PermissionResource,
	permissionStatement,
} from "@repo/auth/permissions";
import { Badge } from "@ui/components/badge";
import { Checkbox } from "@ui/components/checkbox";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Separator } from "@ui/components/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	BuildingIcon,
	CreditCardIcon,
	GlobeIcon,
	type LucideIcon,
	MegaphoneIcon,
	MonitorIcon,
	NetworkIcon,
	SearchIcon,
} from "lucide-react";

interface RolePermissionsGridProps {
	value: PermissionRecord;
	onChange: (permissions: PermissionRecord) => void;
	disabled?: boolean;
}

const RESOURCE_LABELS: Record<PermissionResource, string> = {
	organization: "Organization",
	member: "Members",
	invitation: "Invitations",
	ac: "Access Control",
	aiAgents: "AI Agents",
	watchers: "Watchers",
	customers: "Customers",
	servicePlans: "Service Plans",
	stations: "Stations",
	bases: "Bases",
	groups: "Areas",
	accessPoints: "Access Points",
	employees: "Employees",
	tasks: "Tasks",
	webhooks: "Webhooks",
	apiKeys: "API Keys",
	audit: "Audit Logs",
	billing: "Billing",
	inventory: "Inventory",
	installations: "Installations",
	expenses: "Expenses",
	followups: "Follow-ups",
	connections: "Integrations",
	marketing: "Marketing",
};

const ACTION_LABELS: Record<string, string> = {
	create: "Create",
	read: "Read",
	update: "Update",
	delete: "Delete",
	cancel: "Cancel",
	view: "View",
	manage: "Manage",
	export: "Export",
	import: "Import",
	assign: "Assign",
	collect: "Collect",
	approve: "Approve",
	sync: "Sync",
	send: "Send",
};

const GROUP_ICONS: Record<string, LucideIcon> = {
	organization: BuildingIcon,
	ispManagement: NetworkIcon,
	aiMonitoring: MonitorIcon,
	integrations: GlobeIcon,
	marketing: MegaphoneIcon,
	insights: SearchIcon,
	billing: CreditCardIcon,
};

const GROUP_DESCRIPTIONS: Record<string, string> = {
	organization:
		"Control who can manage your organization settings, members, and roles",
	ispManagement:
		"Manage access to customers, plans, stations, employees, tasks, and more",
	aiMonitoring: "Configure access to AI agents and automated monitoring",
	integrations: "Control webhooks, API keys, and third-party connections",
	marketing:
		"Send WhatsApp broadcasts via Salti and manage marketing credentials",
	insights: "Manage access to audit logs and analytics",
	billing:
		"Control payment collection, billing management, and financial data",
};

export function RolePermissionsGrid({
	value,
	onChange,
	disabled,
}: RolePermissionsGridProps) {
	const hasAction = (
		resource: PermissionResource,
		action: string,
	): boolean => {
		const actions = (value[resource] ?? []) as string[];
		return actions.includes(action) || actions.includes(`${action}:own`);
	};

	const getScope = (
		resource: PermissionResource,
		action: string,
	): "all" | "own" => {
		const actions = (value[resource] ?? []) as string[];
		if (actions.includes(`${action}:own`)) {
			return "own";
		}
		return "all";
	};

	const toggleAction = (resource: PermissionResource, action: string) => {
		const currentActions = (value[resource] ?? []) as string[];
		const hasBaseAction = currentActions.includes(action);
		const hasOwnAction = currentActions.includes(`${action}:own`);

		let newActions: string[];
		if (hasBaseAction || hasOwnAction) {
			newActions = currentActions.filter(
				(a) => a !== action && a !== `${action}:own`,
			);
		} else {
			newActions = [...currentActions, action];
		}

		const newValue: PermissionRecord = { ...value };
		if (newActions.length > 0) {
			(newValue[resource] as string[]) = newActions;
		} else {
			delete newValue[resource];
		}
		onChange(newValue);
	};

	const setScope = (
		resource: PermissionResource,
		action: string,
		scope: "all" | "own",
	) => {
		const currentActions = (value[resource] ?? []) as string[];
		const filtered = currentActions.filter(
			(a) => a !== action && a !== `${action}:own`,
		);
		const newAction = scope === "own" ? `${action}:own` : action;
		const newActions = [...filtered, newAction];

		const newValue: PermissionRecord = { ...value };
		(newValue[resource] as string[]) = newActions;
		onChange(newValue);
	};

	const toggleAllForResource = (resource: PermissionResource) => {
		const actions =
			permissionStatement[resource as keyof typeof permissionStatement];
		const baseActions = actions.filter((a) => !a.endsWith(":own"));
		const currentActions = (value[resource] ?? []) as string[];
		const allEnabled = baseActions.every(
			(action) =>
				currentActions.includes(action) ||
				currentActions.includes(`${action}:own`),
		);

		const newValue: PermissionRecord = { ...value };
		if (allEnabled) {
			delete newValue[resource];
		} else {
			(newValue[resource] as string[]) = [...baseActions];
		}
		onChange(newValue);
	};

	const getResourcePermissionCount = (resource: PermissionResource) => {
		const actions =
			permissionStatement[resource as keyof typeof permissionStatement];
		const baseActions = actions.filter((a) => !a.endsWith(":own"));
		const currentActions = (value[resource] ?? []) as string[];
		const enabledCount = baseActions.filter(
			(action) =>
				currentActions.includes(action) ||
				currentActions.includes(`${action}:own`),
		).length;
		return { enabled: enabledCount, total: baseActions.length };
	};

	return (
		<TooltipProvider delayDuration={300}>
			<div className="space-y-8">
				{Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => {
					const GroupIcon = GROUP_ICONS[groupKey];
					return (
						<div key={groupKey}>
							<div className="mb-4 flex items-center gap-2.5">
								{GroupIcon && (
									<div className="flex size-8 items-center justify-center rounded-lg bg-muted">
										<GroupIcon className="size-4 text-muted-foreground" />
									</div>
								)}
								<div>
									<h4 className="text-sm font-semibold">
										{group.label}
									</h4>
									{GROUP_DESCRIPTIONS[groupKey] && (
										<p className="text-xs text-muted-foreground">
											{GROUP_DESCRIPTIONS[groupKey]}
										</p>
									)}
								</div>
							</div>

							<div className="space-y-2">
								{group.resources.map((resource) => {
									const actions =
										permissionStatement[
											resource as keyof typeof permissionStatement
										];
									const baseActions = actions.filter(
										(a) => !a.endsWith(":own"),
									);
									const counts = getResourcePermissionCount(
										resource as PermissionResource,
									);
									const allEnabled =
										counts.enabled === counts.total;
									const someEnabled =
										counts.enabled > 0 && !allEnabled;

									return (
										<div
											key={resource}
											className={cn(
												"rounded-lg border transition-colors",
												counts.enabled > 0
													? "border-border bg-card"
													: "border-border/60 bg-muted/20",
											)}
										>
											{/* Resource header */}
											<div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3">
												<div className="flex items-center gap-3">
													<Checkbox
														checked={
															allEnabled
																? true
																: someEnabled
																	? "indeterminate"
																	: false
														}
														onCheckedChange={() =>
															toggleAllForResource(
																resource as PermissionResource,
															)
														}
														disabled={disabled}
														aria-label={`Toggle all ${RESOURCE_LABELS[resource as PermissionResource]} permissions`}
													/>
													<span className="text-sm font-medium">
														{
															RESOURCE_LABELS[
																resource as PermissionResource
															]
														}
													</span>
												</div>
												<Badge
													variant={
														counts.enabled > 0
															? "default"
															: "secondary"
													}
													className="tabular-nums text-[10px] px-1.5 py-0"
												>
													{counts.enabled}/
													{counts.total}
												</Badge>
											</div>

											{/* Actions grid */}
											{counts.enabled > 0 && (
												<>
													<Separator />
													<div className="px-3 sm:px-4 py-3">
														<div className="flex flex-wrap gap-2">
															{baseActions.map(
																(action) => {
																	const id = `${resource}-${action}`;
																	const isScoped =
																		isActionScoped(
																			resource,
																			action,
																		);
																	const actionEnabled =
																		hasAction(
																			resource as PermissionResource,
																			action,
																		);
																	const currentScope =
																		getScope(
																			resource as PermissionResource,
																			action,
																		);

																	return (
																		<div
																			key={
																				action
																			}
																			className={cn(
																				"flex items-center gap-2 rounded-md border px-3 py-1.5 transition-all",
																				actionEnabled
																					? "border-primary/20 bg-primary/5"
																					: "border-transparent bg-muted/40",
																			)}
																		>
																			<Checkbox
																				id={
																					id
																				}
																				checked={
																					actionEnabled
																				}
																				onCheckedChange={() =>
																					toggleAction(
																						resource as PermissionResource,
																						action,
																					)
																				}
																				disabled={
																					disabled
																				}
																				className="size-3.5"
																			/>
																			<Label
																				htmlFor={
																					id
																				}
																				className="cursor-pointer text-xs font-medium"
																			>
																				{ACTION_LABELS[
																					action
																				] ??
																					action}
																			</Label>

																			{isScoped &&
																				actionEnabled && (
																					<ScopeSelector
																						value={
																							currentScope
																						}
																						onChange={(
																							val,
																						) =>
																							setScope(
																								resource as PermissionResource,
																								action,
																								val,
																							)
																						}
																						disabled={
																							disabled
																						}
																					/>
																				)}
																		</div>
																	);
																},
															)}
														</div>
													</div>
												</>
											)}

											{/* Collapsed: show action chips inline */}
											{counts.enabled === 0 && (
												<>
													<Separator className="opacity-40" />
													<div className="px-3 sm:px-4 py-2.5">
														<div className="flex flex-wrap gap-1.5">
															{baseActions.map(
																(action) => (
																	<button
																		type="button"
																		key={
																			action
																		}
																		className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
																		onClick={() => {
																			if (
																				!disabled
																			) {
																				toggleAction(
																					resource as PermissionResource,
																					action,
																				);
																			}
																		}}
																		disabled={
																			disabled
																		}
																	>
																		<Checkbox
																			checked={
																				false
																			}
																			disabled={
																				disabled
																			}
																			className="size-3 opacity-50"
																			tabIndex={
																				-1
																			}
																		/>
																		{ACTION_LABELS[
																			action
																		] ??
																			action}
																	</button>
																),
															)}
														</div>
													</div>
												</>
											)}
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</TooltipProvider>
	);
}

function ScopeSelector({
	value,
	onChange,
	disabled,
}: {
	value: "all" | "own";
	onChange: (val: "all" | "own") => void;
	disabled?: boolean;
}) {
	if (disabled) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						variant={value === "own" ? "warning" : "secondary"}
						className="ml-1 cursor-default text-[10px] px-1.5 py-0"
					>
						{value === "own" ? "Own" : "All"}
					</Badge>
				</TooltipTrigger>
				<TooltipContent>
					{value === "own"
						? "Can only access own records"
						: "Can access all records"}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Select
			value={value}
			onValueChange={(val: "all" | "own") => onChange(val)}
		>
			<SelectTrigger
				className={cn(
					"ml-1 h-6 w-auto min-w-[80px] gap-1 rounded-full border-none px-2.5 text-[10px] font-medium shadow-none",
					value === "own"
						? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
						: "bg-muted text-muted-foreground",
				)}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="end">
				<SelectItem value="all">
					<span className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-emerald-500" />
						All records
					</span>
				</SelectItem>
				<SelectItem value="own">
					<span className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-amber-500" />
						Own only
					</span>
				</SelectItem>
			</SelectContent>
		</Select>
	);
}
