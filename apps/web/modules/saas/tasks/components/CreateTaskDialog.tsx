"use client";

import { useBasesQuery } from "@saas/customers/client";
import { useEmployeesQuery } from "@saas/employees/client";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import {
	ClipboardListIcon,
	HammerIcon,
	HardHatIcon,
	InfoIcon,
	LifeBuoyIcon,
	PackageMinusIcon,
	ReceiptIcon,
	ReplaceIcon,
	TriangleAlertIcon,
	WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateTask } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_META,
	TASK_CATEGORY_OPTIONS,
	TASK_PRIORITY_OPTIONS,
	type TaskCategoryValue,
} from "../lib/constants";

type AddonType = "IPTV" | "REAL_IP";
const ADDON_OPTIONS: { value: AddonType; label: string }[] = [
	{ value: "IPTV", label: "IPTV" },
	{ value: "REAL_IP", label: "Real IP" },
];

const CATEGORY_ICONS: Record<
	TaskCategoryValue,
	ComponentType<{ className?: string }>
> = {
	INSTALLATION: WrenchIcon,
	REPLACEMENT: ReplaceIcon,
	UNINSTALL: PackageMinusIcon,
	MAINTENANCE: HardHatIcon,
	REPAIR: HammerIcon,
	SUPPORT: LifeBuoyIcon,
	BILLING: ReceiptIcon,
	GENERAL: ClipboardListIcon,
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single-purpose TanStack Form create dialog; splitting would scatter shared form state
export function CreateTaskDialog({
	open,
	onOpenChange,
	defaultCustomer = null,
	defaultCategory = "GENERAL",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// Pre-seeds initial state only — callers opening the dialog for a
	// different customer should remount it with a `key`.
	defaultCustomer?: {
		id: string;
		name: string;
		username: string | null;
	} | null;
	defaultCategory?: TaskCategoryValue;
}) {
	const organizationId = useOrganizationId();
	const createTask = useCreateTask();
	const { bases } = useBasesQuery();
	const { employees } = useEmployeesQuery({ role: "worker" });
	const [customer, setCustomer] = useState<{
		id: string;
		name: string;
		username: string | null;
	} | null>(defaultCustomer);
	const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>(
		[],
	);
	const [notifyCustomerWhatsApp, setNotifyCustomerWhatsApp] = useState(false);
	const [addonTypes, setAddonTypes] = useState<AddonType[]>([]);

	const form = useForm({
		defaultValues: {
			title: "",
			description: "",
			priority: "MEDIUM",
			category: defaultCategory as string,
			dueDate: "",
			baseId: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			const meta =
				TASK_CATEGORY_META[value.category as TaskCategoryValue];
			if (meta?.requiresTarget && !customer && !value.baseId) {
				toast.error(
					`${meta.label} tasks must target a customer or a base.`,
				);
				return;
			}
			try {
				await createTask.mutateAsync({
					organizationId,
					title: value.title,
					description: value.description || undefined,
					priority: value.priority as
						| "LOW"
						| "MEDIUM"
						| "HIGH"
						| "URGENT",
					category: value.category as TaskCategoryValue,
					customerId: customer?.id ?? undefined,
					employeeIds: assignedEmployeeIds.length
						? assignedEmployeeIds
						: undefined,
					notifyCustomerWhatsApp:
						notifyCustomerWhatsApp && customer !== null
							? true
							: undefined,
					dueDate: value.dueDate
						? new Date(value.dueDate)
						: undefined,
					baseId: value.baseId || undefined,
					requestedAddons:
						customer && addonTypes.length ? addonTypes : undefined,
					notes: value.notes || undefined,
				});
				toast.success("Task created");
				onOpenChange(false);
				form.reset();
				setCustomer(null);
				setAssignedEmployeeIds([]);
				setNotifyCustomerWhatsApp(false);
				setAddonTypes([]);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create task",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const category = useStore(
		form.store,
		(s) => s.values.category,
	) as TaskCategoryValue;
	const baseId = useStore(form.store, (s) => s.values.baseId);
	const categoryMeta = TASK_CATEGORY_META[category];
	// Foolproofing: install-type tasks can't be completed without a target,
	// so block creating one with neither a customer nor a base.
	const missingTarget =
		Boolean(categoryMeta?.requiresTarget) && !customer && !baseId;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Create Task</SheetTitle>
				</SheetHeader>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- canonical TanStack Form submit; not a server-action form */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
						<form.Field name="title">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="task-title">Title *</Label>
									<Input
										id="task-title"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Task title"
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="description">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="task-desc">
										Description
									</Label>
									<Textarea
										id="task-desc"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										rows={3}
									/>
								</div>
							)}
						</form.Field>

						<div className="space-y-3 rounded-lg border border-border bg-surface-subtle/40 p-4">
							<div className="space-y-0.5">
								<p className="font-medium text-sm">Target</p>
								<p className="text-muted-foreground text-xs">
									Link this task to a customer or a base.
									Leave both empty for a general task.
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="task-customer">Customer</Label>
								<CustomerCombobox
									value={customer}
									onChange={(next) => {
										setCustomer(next);
										if (next) {
											form.setFieldValue("baseId", "");
										} else {
											setAddonTypes([]);
										}
									}}
									placeholder="Search a customer…"
								/>
							</div>
							<form.Field name="baseId">
								{(field) => (
									<div className="space-y-2">
										<Label>Base</Label>
										<Select
											value={field.state.value || "none"}
											onValueChange={(v) => {
												const next =
													v === "none" ? "" : v;
												field.handleChange(next);
												if (next) {
													setCustomer(null);
													setAddonTypes([]);
												}
											}}
										>
											<SelectTrigger>
												<SelectValue placeholder="No base" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">
													No base
												</SelectItem>
												{bases.length === 0 ? (
													<div className="px-2 py-1.5 text-muted-foreground text-sm">
														No bases yet
													</div>
												) : (
													bases.map((b) => (
														<SelectItem
															key={b.id}
															value={b.id}
														>
															{b.name}
														</SelectItem>
													))
												)}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
							{customer && (
								<div className="space-y-1.5 border-border border-t pt-3">
									<Label>Add-ons to set up</Label>
									<p className="text-muted-foreground text-xs">
										Tell the worker which add-ons to enable.
										They confirm it on completion.
									</p>
									<div className="flex flex-wrap gap-2">
										{ADDON_OPTIONS.map((opt) => {
											const active = addonTypes.includes(
												opt.value,
											);
											return (
												<button
													key={opt.value}
													type="button"
													onClick={() =>
														setAddonTypes((prev) =>
															prev.includes(
																opt.value,
															)
																? prev.filter(
																		(t) =>
																			t !==
																			opt.value,
																	)
																: [
																		...prev,
																		opt.value,
																	],
														)
													}
													className={cn(
														"rounded-full border px-3 py-1 text-sm transition-colors",
														active
															? "border-primary bg-primary/10 text-primary"
															: "border-border text-muted-foreground hover:bg-muted",
													)}
												>
													{active ? "✓ " : ""}
													{opt.label}
												</button>
											);
										})}
									</div>
								</div>
							)}
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="priority">
								{(field) => (
									<div className="space-y-2">
										<Label>Priority</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{TASK_PRIORITY_OPTIONS.map(
													(opt) => (
														<SelectItem
															key={opt.value}
															value={opt.value}
														>
															{opt.label}
														</SelectItem>
													),
												)}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
							<form.Field name="category">
								{(field) => (
									<div className="space-y-2">
										<Label>Category</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{TASK_CATEGORY_OPTIONS.map(
													(opt) => {
														const Icon =
															CATEGORY_ICONS[
																opt.value
															];
														return (
															<SelectItem
																key={opt.value}
																value={
																	opt.value
																}
															>
																<span className="flex items-center gap-2">
																	<Icon className="size-4 text-muted-foreground" />
																	{opt.label}
																</span>
															</SelectItem>
														);
													},
												)}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
						</div>

						{/* Contextual explainer: what this category means for the worker */}
						{categoryMeta ? (
							<div className="space-y-2">
								<div className="flex gap-2.5 rounded-lg border border-border bg-surface-subtle/40 p-3">
									<InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
									<div className="space-y-1 text-sm">
										<p className="text-foreground">
											{categoryMeta.summary}
										</p>
										<p className="text-muted-foreground text-xs">
											On completion:{" "}
											{categoryMeta.completion}
										</p>
									</div>
								</div>
								{missingTarget ? (
									<div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
										<TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
										<p className="text-xs">
											{categoryMeta.label} tasks must
											target a customer or a base — the
											worker can't record equipment
											without one. Pick a target above.
										</p>
									</div>
								) : null}
							</div>
						) : null}

						<form.Field name="dueDate">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="task-due">Due Date</Label>
									<Input
										id="task-due"
										type="date"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>

						<div className="space-y-2">
							<Label>Assign workers</Label>
							<div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border p-2">
								{employees.length === 0 ? (
									<p className="px-1 py-2 text-sm text-muted-foreground">
										No active workers.
									</p>
								) : (
									employees.map((emp) => (
										<label
											key={emp.id}
											className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
										>
											<input
												type="checkbox"
												className="size-4"
												checked={assignedEmployeeIds.includes(
													emp.id,
												)}
												onChange={() =>
													setAssignedEmployeeIds(
														(prev) =>
															prev.includes(
																emp.id,
															)
																? prev.filter(
																		(id) =>
																			id !==
																			emp.id,
																	)
																: [
																		...prev,
																		emp.id,
																	],
													)
												}
											/>
											<span className="text-sm">
												{emp.name}
											</span>
										</label>
									))
								)}
							</div>
						</div>

						{customer &&
						(category === "MAINTENANCE" ||
							category === "REPAIR") ? (
							<label className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
								<input
									type="checkbox"
									className="size-4"
									checked={notifyCustomerWhatsApp}
									onChange={(e) =>
										setNotifyCustomerWhatsApp(
											e.target.checked,
										)
									}
								/>
								<span className="text-sm">
									Send WhatsApp to the customer about the
									maintenance visit
								</span>
							</label>
						) : null}

						<form.Field name="notes">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="task-notes">Notes</Label>
									<Textarea
										id="task-notes"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										rows={2}
									/>
								</div>
							)}
						</form.Field>
					</div>
					<SheetFooter className="border-t border-border bg-surface-subtle/40 px-6 py-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isSubmitting || missingTarget}
						>
							{isSubmitting ? "Creating..." : "Create Task"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
