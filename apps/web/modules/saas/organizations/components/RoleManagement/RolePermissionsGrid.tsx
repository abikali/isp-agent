"use client";

import {
	isActionScoped,
	PERMISSION_GROUPS,
	type PermissionRecord,
	type PermissionResource,
	permissionStatement,
} from "@repo/auth/permissions";
import { Checkbox } from "@ui/components/checkbox";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { cn } from "@ui/lib";

interface RolePermissionsGridProps {
	value: PermissionRecord;
	onChange: (permissions: PermissionRecord) => void;
	disabled?: boolean;
}

/**
 * Resource labels for display in the UI.
 */
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
	employees: "Employees",
	tasks: "Tasks",
	webhooks: "Webhooks",
	apiKeys: "API Keys",
	audit: "Audit Logs",
	billing: "Billing",
	connections: "Integrations",
};

/**
 * Action labels for display in the UI.
 */
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
	unassign: "Unassign",
	"update-config": "Update Config",
};

export function RolePermissionsGrid({
	value,
	onChange,
	disabled,
}: RolePermissionsGridProps) {
	/**
	 * Check if an action (with or without :own suffix) is in the permissions.
	 */
	const hasAction = (
		resource: PermissionResource,
		action: string,
	): boolean => {
		const actions = (value[resource] ?? []) as string[];
		return actions.includes(action) || actions.includes(`${action}:own`);
	};

	/**
	 * Get current scope for an action ("all" or "own").
	 */
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

	/**
	 * Toggle an action on/off. When enabling, defaults to "all" scope.
	 */
	const toggleAction = (resource: PermissionResource, action: string) => {
		const currentActions = (value[resource] ?? []) as string[];
		const hasBaseAction = currentActions.includes(action);
		const hasOwnAction = currentActions.includes(`${action}:own`);

		let newActions: string[];

		if (hasBaseAction || hasOwnAction) {
			// Remove both variants
			newActions = currentActions.filter(
				(a) => a !== action && a !== `${action}:own`,
			);
		} else {
			// Add with "all" scope (no suffix)
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

	/**
	 * Set scope for an action to "all" or "own".
	 */
	const setScope = (
		resource: PermissionResource,
		action: string,
		scope: "all" | "own",
	) => {
		const currentActions = (value[resource] ?? []) as string[];

		// Remove both variants
		const filtered = currentActions.filter(
			(a) => a !== action && a !== `${action}:own`,
		);

		// Add with new scope
		const newAction = scope === "own" ? `${action}:own` : action;
		const newActions = [...filtered, newAction];

		const newValue: PermissionRecord = { ...value };
		(newValue[resource] as string[]) = newActions;

		onChange(newValue);
	};

	return (
		<div className="space-y-6">
			{Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
				<div key={groupKey} className="space-y-3">
					<h4 className="text-sm font-medium text-muted-foreground">
						{group.label}
					</h4>
					<div className="grid gap-3">
						{group.resources.map((resource) => {
							const actions =
								permissionStatement[
									resource as keyof typeof permissionStatement
								];
							return (
								<div
									key={resource}
									className="rounded-lg border bg-card p-3 sm:p-4"
								>
									<div className="mb-3">
										<span className="font-medium text-sm sm:text-base">
											{
												RESOURCE_LABELS[
													resource as PermissionResource
												]
											}
										</span>
									</div>
									{/* Grid layout: 1 col on mobile, 2 cols on sm, 3 cols on lg */}
									<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
										{actions
											// Filter out :own variants because scope is shown as a dropdown
											// ("All records" / "Own only") rather than separate checkboxes
											.filter(
												(action) =>
													!action.endsWith(":own"),
											)
											.map((action) => {
												const id = `${resource}-${action}`;
												const isScoped = isActionScoped(
													resource,
													action,
												);
												const actionEnabled = hasAction(
													resource as PermissionResource,
													action,
												);
												const currentScope = getScope(
													resource as PermissionResource,
													action,
												);

												return (
													<div
														key={action}
														className={cn(
															"flex items-center justify-between gap-2 rounded-md p-2 transition-colors",
															actionEnabled
																? "bg-primary/5"
																: "bg-muted/30",
														)}
													>
														<div className="flex items-center gap-2 min-w-0">
															<Checkbox
																id={id}
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
															/>
															<Label
																htmlFor={id}
																className="text-sm font-normal cursor-pointer truncate"
															>
																{ACTION_LABELS[
																	action
																] || action}
															</Label>
														</div>

														{/* Scope selector - only show when action is enabled AND supports scope */}
														{isScoped &&
															actionEnabled &&
															!disabled && (
																<Select
																	value={
																		currentScope
																	}
																	onValueChange={(
																		val:
																			| "all"
																			| "own",
																	) =>
																		setScope(
																			resource as PermissionResource,
																			action,
																			val,
																		)
																	}
																>
																	<SelectTrigger className="h-7 w-auto min-w-[90px] text-xs">
																		<SelectValue />
																	</SelectTrigger>
																	<SelectContent>
																		<SelectItem value="all">
																			All
																			records
																		</SelectItem>
																		<SelectItem value="own">
																			Own
																			only
																		</SelectItem>
																	</SelectContent>
																</Select>
															)}
													</div>
												);
											})}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
