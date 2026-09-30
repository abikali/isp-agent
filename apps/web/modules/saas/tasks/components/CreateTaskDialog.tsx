"use client";

import { buildTaskTitle } from "@repo/api/modules/tasks/lib/task-title";
import {
	CustomerNearbyBoxesNotice,
	useBasesQuery,
	useStationsQuery,
} from "@saas/customers/client";
import { useEmployeesQuery } from "@saas/employees/client";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
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
import { toDuePayload } from "../lib/task-utils";
import { OpenTasksNotice } from "./OpenTasksNotice";

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
	const { stations } = useStationsQuery();
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
	const assignedIdSet = new Set(assignedEmployeeIds);

	const form = useForm({
		defaultValues: {
			description: "",
			priority: "MEDIUM",
			category: defaultCategory as string,
			dueDate: "",
			dueTime: "",
			baseId: "",
			stationId: "",
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
			if (assignedEmployeeIds.length === 0) {
				toast.error("Assign at least one worker.");
				return;
			}
			try {
				await createTask.mutateAsync({
					organizationId,
					// No title field: the server derives it from the category
					// and the target (see @repo/api task-title).
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
					...(value.dueDate
						? toDuePayload(value.dueDate, value.dueTime)
						: {}),
					baseId: value.baseId || undefined,
					stationId: value.stationId || undefined,
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
	const dueDate = useStore(form.store, (s) => s.values.dueDate);
	const dueTime = useStore(form.store, (s) => s.values.dueTime);
	// Warn only — back-dating a visit that already happened is legitimate.
	const dueInPast = Boolean(
		dueDate &&
			dueTime &&
			(toDuePayload(dueDate, dueTime).dueDate?.getTime() ?? 0) <
				Date.now(),
	);
	const categoryMeta = TASK_CATEGORY_META[category];
	// Same builder the server uses, minus the id-derived code it can't know yet.
	const titlePreview = buildTaskTitle({
		category,
		target:
			customer?.name ||
			customer?.username ||
			bases.find((b) => b.id === baseId)?.name,
	});
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
						{/* Titles are generated, not typed — show exactly what gets stored. */}
						<div className="rounded-lg border border-border bg-surface-subtle/40 px-3 py-2.5">
							<p className="font-medium text-sm">
								{titlePreview}{" "}
								<span className="text-muted-foreground">
									#••••
								</span>
							</p>
							<p className="text-muted-foreground text-xs">
								Title is generated from the category and target
								— a short code is added to keep it unique.
							</p>
						</div>

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
							{customer && (
								<OpenTasksNotice customerId={customer.id} />
							)}
							{customer && category === "INSTALLATION" && (
								<CustomerNearbyBoxesNotice
									customerId={customer.id}
								/>
							)}
							<form.Field name="baseId">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="task-base">Base</Label>
										<Combobox
											id="task-base"
											value={field.state.value || "none"}
											onChange={(v) => {
												const next =
													v === "none" ? "" : v;
												field.handleChange(next);
												if (next) {
													setCustomer(null);
													setAddonTypes([]);
												}
											}}
											searchPlaceholder="Search bases…"
											emptyText="No base matches"
											options={[
												{
													value: "none",
													label: "No base",
												},
												...bases.map((b) => ({
													value: b.id,
													label: b.name,
												})),
											]}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="stationId">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="task-station">
											Station
										</Label>
										<Combobox
											id="task-station"
											value={field.state.value || "none"}
											onChange={(v) =>
												field.handleChange(
													v === "none" ? "" : v,
												)
											}
											searchPlaceholder="Search stations…"
											emptyText="No station matches"
											options={[
												{
													value: "none",
													label: "No station",
												},
												...stations.map((s) => ({
													value: s.id,
													label: s.name,
												})),
											]}
										/>
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

						<div className="grid grid-cols-2 gap-3">
							<form.Field name="dueDate">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="task-due">
											Due date
										</Label>
										<Input
											id="task-due"
											type="date"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="dueTime">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="task-due-time">
											Time (Beirut, optional)
										</Label>
										<Input
											id="task-due-time"
											type="time"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
										/>
									</div>
								)}
							</form.Field>
						</div>
						{dueInPast && (
							<p className="-mt-2 text-warning text-xs">
								This due time is already in the past.
							</p>
						)}

						<div className="space-y-2">
							<Label>
								Assign workers{" "}
								<span className="text-destructive">*</span>
							</Label>
							{assignedEmployeeIds.length === 0 && (
								<p className="text-xs text-destructive">
									Pick at least one worker — a task with
									nobody on it never gets done.
								</p>
							)}
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
												checked={assignedIdSet.has(
													emp.id,
												)}
												onChange={() =>
													setAssignedEmployeeIds(
														(prev) => {
															const next =
																new Set(prev);
															if (
																!next.delete(
																	emp.id,
																)
															) {
																next.add(
																	emp.id,
																);
															}
															return [...next];
														},
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
							disabled={
								isSubmitting ||
								missingTarget ||
								assignedEmployeeIds.length === 0
							}
						>
							{isSubmitting ? "Creating..." : "Create Task"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
