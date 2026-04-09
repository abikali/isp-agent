"use client";

import { isValidEmail } from "@repo/api/lib/validation";
import { CUSTOMER_STATUS_LABELS } from "@saas/customers";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@saas/tasks";
import { DetailPanel, DetailSection } from "@shared/components/DetailPanel";
import { FieldGroup } from "@shared/components/FieldGroup";
import { MetricDisplay } from "@shared/components/MetricDisplay";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { SyncPreviewDialog } from "@shared/components/SyncPreviewDialog";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import type {
	FormAsyncValidateOrFn,
	FormValidateOrFn,
	ReactFormExtendedApi,
} from "@tanstack/react-form";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Textarea } from "@ui/components/textarea";
import {
	CheckCircle2Icon,
	ClipboardListIcon,
	DollarSignIcon,
	LogInIcon,
	PackageIcon,
	PlusIcon,
	RefreshCwIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useDeleteEmployee,
	useInviteEmployee,
	useUpdateEmployee,
} from "../hooks/use-employees";
import {
	EMPLOYEE_DEPARTMENT_OPTIONS,
	EMPLOYEE_STATUS_LABELS,
	EMPLOYEE_STATUS_OPTIONS,
} from "../lib/constants";
import { AssignStationDialog } from "./AssignStationDialog";

type EmployeeData = Awaited<
	ReturnType<typeof orpcClient.employees.get>
>["employee"];

const PAYMENT_STATUS_LABELS: Record<string, string> = {
	COLLECTED: "Collected",
	REVIEWED: "Reviewed",
	PENDING: "Pending",
};

const EXPENSE_STATUS_LABELS: Record<string, string> = {
	PENDING: "Pending",
	APPROVED: "Approved",
	REJECTED: "Rejected",
};

const INSTALLATION_STATUS_LABELS: Record<string, string> = {
	PENDING: "Pending",
	COMPLETED: "Completed",
	CANCELLED: "Cancelled",
};

const CASH_TYPE_LABELS: Record<string, string> = {
	HANDOFF: "Handoff",
	EXPENSE: "Expense",
	RETURN: "Return",
};

function getEmployeeFormDefaults(employee: EmployeeData) {
	return {
		name: employee.name,
		email: employee.email ?? "",
		phone: employee.phone ?? "",
		position: employee.position ?? "",
		department: employee.department ?? "",
		hireDate: employee.hireDate
			? (new Date(employee.hireDate).toISOString().split("T")[0] ?? "")
			: "",
		status: employee.status,
		preferredLayout: employee.preferredLayout ?? "standard",
		telegramChatId: employee.telegramChatId ?? "",
		notes: employee.notes ?? "",
	};
}

type EmployeeFormValues = ReturnType<typeof getEmployeeFormDefaults>;

type EmployeeForm = ReactFormExtendedApi<
	EmployeeFormValues,
	undefined | FormValidateOrFn<EmployeeFormValues>,
	undefined | FormValidateOrFn<EmployeeFormValues>,
	undefined | FormAsyncValidateOrFn<EmployeeFormValues>,
	undefined | FormValidateOrFn<EmployeeFormValues>,
	undefined | FormAsyncValidateOrFn<EmployeeFormValues>,
	undefined | FormValidateOrFn<EmployeeFormValues>,
	undefined | FormAsyncValidateOrFn<EmployeeFormValues>,
	undefined | FormValidateOrFn<EmployeeFormValues>,
	undefined | FormAsyncValidateOrFn<EmployeeFormValues>,
	undefined | FormAsyncValidateOrFn<EmployeeFormValues>,
	unknown
>;

export function EmployeeDetail({
	employeeId,
	organizationSlug,
}: {
	employeeId: string;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const updateEmployee = useUpdateEmployee();
	const deleteEmployee = useDeleteEmployee();
	const inviteEmployee = useInviteEmployee();
	const [showAssignStations, setShowAssignStations] = useState(false);
	const [showInvite, setShowInvite] = useState(false);
	const [showSyncPreview, setShowSyncPreview] = useState(false);
	const [inviteRole, setInviteRole] = useState("collector");
	const [inviteUsername, setInviteUsername] = useState("");

	const { data } = useSuspenseQuery(
		orpc.employees.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				id: employeeId,
			},
		}),
	);

	const employee = data.employee;

	const form = useForm({
		defaultValues: getEmployeeFormDefaults(employee),
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}

			await toast.promise(
				updateEmployee.mutateAsync({
					organizationId,
					id: employeeId,
					name: value.name,
					email: value.email || null,
					phone: value.phone || null,
					position: value.position || null,
					department: (value.department || null) as
						| "TECHNICAL"
						| "CUSTOMER_SERVICE"
						| "BILLING"
						| "MANAGEMENT"
						| "FIELD_OPS"
						| null,
					hireDate: value.hireDate ? new Date(value.hireDate) : null,
					status: value.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE",
					preferredLayout: value.preferredLayout as
						| "standard"
						| "collector",
					telegramChatId: value.telegramChatId || null,
					notes: value.notes || null,
				}),
				{
					loading: "Saving employee...",
					success: "Employee updated",
					error: (error: { message?: string }) =>
						error.message ?? "Failed to update employee",
				},
			);
		},
	});

	const isSaving = useStore(form.store, (s) => s.isSubmitting);

	const statusType =
		employee.status === "ACTIVE"
			? "active"
			: employee.status === "ON_LEAVE"
				? "pending"
				: "inactive";

	const totalCustomers =
		employee.customerCollections.length +
		employee.customerWorkerAssignments.length;

	return (
		<PageShell
			title={employee.name}
			backTo={`/app/${organizationSlug}/employees`}
			backLabel="Employees"
			subtitle={
				<span className="flex flex-wrap items-center gap-2 sm:gap-3">
					<span className="font-mono">{employee.employeeNumber}</span>
					<StatusIndicator
						status={statusType}
						variant="badge"
						label={
							EMPLOYEE_STATUS_LABELS[employee.status] ??
							employee.status
						}
					/>
					{employee.userId ? (
						<Badge
							variant="outline"
							className="flex items-center gap-1"
						>
							<CheckCircle2Icon className="size-3 text-green-600" />
							Has login
						</Badge>
					) : null}
					{employee.iRadiusProfile && (
						<Badge variant="outline">
							{employee.iRadiusProfile}
						</Badge>
					)}
				</span>
			}
			actions={
				<div className="flex flex-wrap gap-2">
					{employee.externalId && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowSyncPreview(true)}
						>
							<RefreshCwIcon className="mr-2 size-4" />
							Sync from iRadius
						</Button>
					)}
					{!employee.userId && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								setInviteUsername(employee.username ?? "");
								setShowInvite(true);
							}}
						>
							<LogInIcon className="mr-1 size-3.5" />
							Invite to Login
						</Button>
					)}
					{employee.status === "INACTIVE" ? (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline" size="sm">
									Activate
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Activate Employee
									</AlertDialogTitle>
									<AlertDialogDescription>
										This will set the employee status back
										to active. They will regain access to
										their assigned stations and tasks.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										onClick={() => {
											if (!organizationId) {
												return;
											}
											toast.promise(
												updateEmployee.mutateAsync({
													organizationId,
													id: employeeId,
													name: employee.name,
													status: "ACTIVE",
												}),
												{
													loading:
														"Activating employee...",
													success:
														"Employee activated",
													error: (error: {
														message?: string;
													}) =>
														error.message ??
														"Failed to activate employee",
												},
											);
										}}
									>
										Activate
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					) : (
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline" size="sm">
									Deactivate
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										Deactivate Employee
									</AlertDialogTitle>
									<AlertDialogDescription>
										This will set the employee status to
										inactive. They will lose access to all
										assigned stations and tasks.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										onClick={() => {
											if (!organizationId) {
												return;
											}
											toast.promise(
												deleteEmployee.mutateAsync({
													organizationId,
													id: employeeId,
												}),
												{
													loading:
														"Deactivating employee...",
													success:
														"Employee deactivated",
													error: (error: {
														message?: string;
													}) =>
														error.message ??
														"Failed to deactivate employee",
												},
											);
										}}
									>
										Deactivate
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					)}
					<Button
						size="sm"
						disabled={isSaving}
						onClick={() => form.handleSubmit()}
					>
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<DetailPanel
					tabs={[
						{
							id: "overview",
							label: "Overview",
							icon: UserIcon,
							content: (
								<OverviewTab form={form} employee={employee} />
							),
						},
						{
							id: "customers",
							label: "Customers",
							icon: UsersIcon,
							count: totalCustomers,
							content: (
								<CustomersTab
									employee={employee}
									organizationSlug={organizationSlug}
								/>
							),
						},
						{
							id: "assignments",
							label: "Assignments",
							icon: ClipboardListIcon,
							count:
								employee.stations.length +
								employee.taskAssignments.length,
							content: (
								<AssignmentsTab
									employee={employee}
									organizationSlug={organizationSlug}
									onAssignStation={() =>
										setShowAssignStations(true)
									}
								/>
							),
						},
						{
							id: "financial",
							label: "Financial",
							icon: DollarSignIcon,
							content: (
								<FinancialTab
									employee={employee}
									organizationSlug={organizationSlug}
								/>
							),
						},
						{
							id: "inventory",
							label: "Inventory",
							icon: PackageIcon,
							count: employee.workerStock.length,
							hidden:
								employee.workerStock.length === 0 &&
								employee.installationsDone.length === 0,
							content: (
								<InventoryTab
									employee={employee}
									organizationSlug={organizationSlug}
								/>
							),
						},
					]}
				/>
			</form>

			<AssignStationDialog
				open={showAssignStations}
				onOpenChange={setShowAssignStations}
				employeeId={employeeId}
				currentStationIds={employee.stations.map((es) => es.station.id)}
			/>

			<Dialog open={showInvite} onOpenChange={setShowInvite}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Invite to Login</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							Create a login account for{" "}
							<strong>{employee.name}</strong>. The default
							password is <code>123456</code>.
						</p>
						<div className="space-y-2">
							<Label>Username</Label>
							<Input
								value={inviteUsername}
								onChange={(e) =>
									setInviteUsername(e.target.value)
								}
								placeholder="Login username"
							/>
						</div>
						<div className="space-y-2">
							<Label>Role</Label>
							<Select
								value={inviteRole}
								onValueChange={setInviteRole}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="collector">
										Collector
									</SelectItem>
									<SelectItem value="field_tech">
										Field Technician
									</SelectItem>
									<SelectItem value="manager">
										Manager
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Button
							type="button"
							className="w-full"
							disabled={
								inviteEmployee.isPending ||
								!inviteUsername.trim()
							}
							onClick={() => {
								if (!organizationId) {
									return;
								}
								const mutation = inviteEmployee.mutateAsync({
									organizationId,
									employeeId,
									role: inviteRole as
										| "collector"
										| "field_tech"
										| "manager",
									username: inviteUsername.trim(),
								});

								toast.promise(mutation, {
									loading: "Creating login...",
									success: () => {
										setShowInvite(false);
										return "Login account created";
									},
									error: (error: { message?: string }) =>
										error.message ??
										"Failed to create login account",
								});
							}}
						>
							{inviteEmployee.isPending
								? "Creating..."
								: "Create Login"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
			<SyncPreviewDialog
				open={showSyncPreview}
				onOpenChange={setShowSyncPreview}
				entityType="employee"
				entityIds={[employeeId]}
			/>
		</PageShell>
	);
}

// ─── Overview Tab ──────────────────────────────────────────────────────

function OverviewTab({
	form,
	employee,
}: {
	form: EmployeeForm;
	employee: EmployeeData;
}) {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
			{/* Left column: Personal + Employment — 2/3 width */}
			<div className="lg:col-span-2 space-y-6">
				<DetailSection
					title="Personal Information"
					description="Basic contact details for this employee"
				>
					<FieldGroup columns={2}>
						<form.Field name="name">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="emp-name">
										Name *
									</FieldLabel>
									<Input
										id="emp-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Full name"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field
							name="email"
							validators={{
								onBlur: ({ value }) => {
									const v = value.trim();
									if (!v) {
										return undefined;
									}
									return isValidEmail(v)
										? undefined
										: "Please enter a valid email address";
								},
							}}
						>
							{(field) => {
								const hasErrors =
									field.state.meta.isTouched &&
									field.state.meta.errors.length > 0;
								return (
									<Field
										data-invalid={hasErrors || undefined}
									>
										<FieldLabel htmlFor="emp-email">
											Email
										</FieldLabel>
										<Input
											id="emp-email"
											type="email"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											onBlur={field.handleBlur}
											aria-invalid={
												hasErrors || undefined
											}
											placeholder="email@example.com"
										/>
									</Field>
								);
							}}
						</form.Field>
						<form.Field name="phone">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="emp-phone">
										Phone
									</FieldLabel>
									<Input
										id="emp-phone"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="+961 ..."
									/>
								</Field>
							)}
						</form.Field>
					</FieldGroup>
				</DetailSection>

				<DetailSection
					title="Employment"
					description="Role, department, and employment status"
				>
					<FieldGroup columns={2}>
						<form.Field name="position">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="emp-position">
										Position
									</FieldLabel>
									<Input
										id="emp-position"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="e.g. Network Technician"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="department">
							{(field) => (
								<Field>
									<FieldLabel>Department</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select department" />
										</SelectTrigger>
										<SelectContent>
											{EMPLOYEE_DEPARTMENT_OPTIONS.map(
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
								</Field>
							)}
						</form.Field>
						<form.Field name="hireDate">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="emp-hire">
										Hire Date
									</FieldLabel>
									<Input
										id="emp-hire"
										type="date"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="status">
							{(field) => (
								<Field>
									<FieldLabel>Status</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(v) =>
											field.handleChange(
												v as typeof field.state.value,
											)
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{EMPLOYEE_STATUS_OPTIONS.map(
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
								</Field>
							)}
						</form.Field>
					</FieldGroup>
				</DetailSection>

				<DetailSection
					title="Portal & Notifications"
					description="Configure how this employee interacts with the system"
				>
					<FieldGroup columns={2}>
						<form.Field name="preferredLayout">
							{(field) => (
								<Field>
									<FieldLabel>Portal Layout</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="standard">
												Standard Dashboard
											</SelectItem>
											<SelectItem value="collector">
												Collector Portal
											</SelectItem>
										</SelectContent>
									</Select>
									<FieldDescription>
										Collector portal shows a simplified
										mobile-friendly interface for payment
										collection.
									</FieldDescription>
								</Field>
							)}
						</form.Field>
						<form.Field name="telegramChatId">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="emp-telegram">
										Telegram Chat ID
									</FieldLabel>
									<Input
										id="emp-telegram"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="e.g. 123456789"
									/>
									<FieldDescription>
										Used to send notifications via Telegram
										bot.
									</FieldDescription>
								</Field>
							)}
						</form.Field>
					</FieldGroup>
				</DetailSection>

				{/* External System — read-only */}
				{(employee.externalId || employee.dealer) && (
					<DetailSection
						title="External System"
						description="Synced from iRadius — read-only"
					>
						<PropertyList
							columns={3}
							items={[
								...(employee.externalId
									? [
											{
												label: "External ID",
												value: employee.externalId,
												mono: true,
											},
										]
									: []),
								...(employee.username
									? [
											{
												label: "Username",
												value: employee.username,
												mono: true,
											},
										]
									: []),
								...(employee.iRadiusProfile
									? [
											{
												label: "iRadius Profile",
												value: employee.iRadiusProfile,
											},
										]
									: []),
								...(employee.dealer
									? [
											{
												label: "Dealer",
												value: employee.dealer.name,
											},
										]
									: []),
							]}
						/>
					</DetailSection>
				)}
			</div>

			{/* Right column: Status & Notes — 1/3 width */}
			<div className="space-y-6">
				<DetailSection title="Quick Info">
					<div className="grid grid-cols-2 gap-4">
						<MetricDisplay
							label="Customers"
							value={employee.customerCollections.length}
							format="number"
							secondary="As collector"
						/>
						<MetricDisplay
							label="Payments"
							value={employee.paymentsCollected.length}
							format="number"
							secondary="Collected"
						/>
						<MetricDisplay
							label="Stations"
							value={employee.stations.length}
							format="number"
						/>
						<MetricDisplay
							label="Tasks"
							value={employee.taskAssignments.length}
							format="number"
						/>
					</div>
				</DetailSection>

				<DetailSection title="Notes">
					<form.Field name="notes">
						{(field) => (
							<Textarea
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value)
								}
								rows={5}
								placeholder="Internal notes about this employee..."
							/>
						)}
					</form.Field>
				</DetailSection>
			</div>
		</div>
	);
}

// ─── Customers Tab ─────────────────────────────────────────────────────

type CustomerCollection = EmployeeData["customerCollections"][number];
type WorkerAssignment = EmployeeData["customerWorkerAssignments"][number];

interface CustomerRowShape {
	id: string;
	firstName: string | null;
	lastName: string | null;
	accountNumber: string;
	status: string;
}

function baseCustomerColumns<T extends CustomerRowShape>(
	organizationSlug: string,
): ColumnDef<T, unknown>[] {
	return [
		{
			accessorKey: "firstName",
			header: "Customer",
			cell: ({ row }) => (
				<Link
					to="/app/$organizationSlug/customers/$customerId"
					params={{ organizationSlug, customerId: row.original.id }}
					className="text-sm font-medium hover:underline"
					preload="intent"
				>
					{displayName(row.original.firstName, row.original.lastName)}
				</Link>
			),
		},
		{
			accessorKey: "accountNumber",
			header: "Account #",
			meta: { className: "hidden sm:table-cell" },
			cell: ({ row }) => (
				<span className="font-mono text-sm">
					{row.original.accountNumber}
				</span>
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => (
				<Badge variant="outline">
					{CUSTOMER_STATUS_LABELS[row.original.status] ??
						row.original.status}
				</Badge>
			),
		},
	];
}

function useCollectorColumns(organizationSlug: string) {
	return useMemo<ColumnDef<CustomerCollection, unknown>[]>(
		() => [
			...baseCustomerColumns<CustomerCollection>(organizationSlug),
			{
				accessorKey: "monthlyRate",
				header: "Monthly Rate",
				meta: { className: "hidden md:table-cell text-right" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.monthlyRate != null
							? formatCurrency(row.original.monthlyRate)
							: "-"}
					</span>
				),
			},
		],
		[organizationSlug],
	);
}

function useWorkerColumns(organizationSlug: string) {
	return useMemo<ColumnDef<WorkerAssignment, unknown>[]>(
		() => baseCustomerColumns<WorkerAssignment>(organizationSlug),
		[organizationSlug],
	);
}

function CustomersTab({
	employee,
	organizationSlug,
}: {
	employee: EmployeeData;
	organizationSlug: string;
}) {
	const collectorColumns = useCollectorColumns(organizationSlug);
	const workerColumns = useWorkerColumns(organizationSlug);

	return (
		<>
			<DetailSection
				title="Collecting For"
				description={`${employee.customerCollections.length} customer${employee.customerCollections.length !== 1 ? "s" : ""} assigned for payment collection`}
			>
				<DataTable
					columns={collectorColumns}
					data={employee.customerCollections}
					pageSize={10}
					emptyState={
						<p className="text-sm text-muted-foreground">
							No customers assigned as collector.
						</p>
					}
				/>
			</DetailSection>

			<DetailSection
				title="Field Worker For"
				description={`${employee.customerWorkerAssignments.length} customer${employee.customerWorkerAssignments.length !== 1 ? "s" : ""} assigned for field work`}
			>
				<DataTable
					columns={workerColumns}
					data={employee.customerWorkerAssignments}
					pageSize={10}
					emptyState={
						<p className="text-sm text-muted-foreground">
							No customers assigned as field worker.
						</p>
					}
				/>
			</DetailSection>
		</>
	);
}

type TaskAssignment = EmployeeData["taskAssignments"][number];

function TasksSection({
	employee,
	organizationSlug,
}: {
	employee: EmployeeData;
	organizationSlug: string;
}) {
	const columns = useMemo<ColumnDef<TaskAssignment, unknown>[]>(
		() => [
			{
				accessorFn: (row) => row.task.title,
				id: "title",
				header: "Title",
				cell: ({ row }) => {
					const task = row.original.task;
					return (
						<Link
							to={
								task.source === "AI_ESCALATION"
									? "/app/$organizationSlug/escalations/$taskId"
									: "/app/$organizationSlug/tasks/$taskId"
							}
							params={{ organizationSlug, taskId: task.id }}
							className="text-sm font-medium hover:underline"
							preload="intent"
						>
							{task.title}
						</Link>
					);
				},
			},
			{
				accessorFn: (row) => row.task.status,
				id: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant="outline">
						{TASK_STATUS_LABELS[row.original.task.status] ??
							row.original.task.status}
					</Badge>
				),
			},
			{
				accessorFn: (row) => row.task.priority,
				id: "priority",
				header: "Priority",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{TASK_PRIORITY_LABELS[row.original.task.priority] ??
							row.original.task.priority}
					</span>
				),
			},
			{
				accessorFn: (row) => row.task.dueDate,
				id: "dueDate",
				header: "Due Date",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.task.dueDate
							? new Date(
									row.original.task.dueDate,
								).toLocaleDateString("en-GB")
							: "-"}
					</span>
				),
			},
		],
		[organizationSlug],
	);

	return (
		<DetailSection
			title="Assigned Tasks"
			description="Recent tasks assigned to this employee"
		>
			<DataTable
				columns={columns}
				data={employee.taskAssignments}
				pageSize={10}
				emptyState={
					<p className="text-sm text-muted-foreground">
						No tasks assigned.
					</p>
				}
			/>
		</DetailSection>
	);
}

// ─── Assignments Tab ───────────────────────────────────────────────────

function AssignmentsTab({
	employee,
	organizationSlug,
	onAssignStation,
}: {
	employee: EmployeeData;
	organizationSlug: string;
	onAssignStation: () => void;
}) {
	return (
		<>
			<DetailSection
				title="Assigned Stations"
				description="Stations this employee can access and manage"
				action={
					<Button
						variant="outline"
						size="sm"
						type="button"
						onClick={onAssignStation}
					>
						<PlusIcon className="mr-1 size-3" />
						Assign
					</Button>
				}
			>
				{employee.stations.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No stations assigned.
					</p>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{employee.stations.map((es) => (
							<div
								key={es.station.id}
								className="flex items-center justify-between rounded-lg border p-3"
							>
								<div className="min-w-0">
									<p className="text-sm font-medium truncate">
										{es.station.name}
									</p>
									{es.station.address && (
										<p className="text-xs text-muted-foreground truncate">
											{es.station.address}
										</p>
									)}
								</div>
								<Badge
									variant="outline"
									className="shrink-0 ml-2"
								>
									{es.station.status}
								</Badge>
							</div>
						))}
					</div>
				)}
			</DetailSection>

			<TasksSection
				employee={employee}
				organizationSlug={organizationSlug}
			/>
		</>
	);
}

type PaymentCollected = EmployeeData["paymentsCollected"][number];

function PaymentsSection({
	employee,
	organizationSlug,
}: {
	employee: EmployeeData;
	organizationSlug: string;
}) {
	const columns = useMemo<ColumnDef<PaymentCollected, unknown>[]>(
		() => [
			{
				accessorFn: (row) => row.customer.firstName,
				id: "customer",
				header: "Customer",
				cell: ({ row }) => {
					const p = row.original;
					return (
						<div>
							<Link
								to="/app/$organizationSlug/customers/$customerId"
								params={{
									organizationSlug,
									customerId: p.customer.id,
								}}
								className="text-sm font-medium hover:underline"
								preload="intent"
							>
								{displayName(
									p.customer.firstName,
									p.customer.lastName,
								)}
							</Link>
							<p className="text-xs text-muted-foreground font-mono">
								{p.customer.accountNumber}
							</p>
						</div>
					);
				},
			},
			{
				accessorKey: "paidAmount",
				header: "Amount",
				meta: { className: "text-right" },
				cell: ({ row }) => (
					<span className="font-medium text-sm tabular-nums">
						{formatCurrency(row.original.paidAmount)}
					</span>
				),
			},
			{
				accessorKey: "accountPrice",
				header: "Price",
				meta: { className: "hidden sm:table-cell text-right" },
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground tabular-nums">
						{formatCurrency(row.original.accountPrice)}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<Badge variant="outline">
						{PAYMENT_STATUS_LABELS[row.original.status] ??
							row.original.status}
					</Badge>
				),
			},
			{
				accessorKey: "paidAt",
				header: "Date",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{new Date(row.original.paidAt).toLocaleDateString(
							"en-GB",
						)}
					</span>
				),
			},
		],
		[organizationSlug],
	);

	return (
		<DetailSection
			title="Recent Payments"
			description="Latest payments collected by this employee"
		>
			<DataTable
				columns={columns}
				data={employee.paymentsCollected}
				pageSize={10}
				emptyState={
					<p className="text-sm text-muted-foreground">
						No payments collected.
					</p>
				}
			/>
		</DetailSection>
	);
}

// ─── Financial Tab ─────────────────────────────────────────────────────

function FinancialTab({
	employee,
	organizationSlug,
}: {
	employee: EmployeeData;
	organizationSlug: string;
}) {
	const totalCollected = employee.paymentsCollected.reduce(
		(sum, p) => sum + p.paidAmount,
		0,
	);
	const totalExpenses = employee.expensesSubmitted.reduce(
		(sum, e) => sum + e.amount,
		0,
	);
	const totalCash = employee.cashCollections.reduce(
		(sum, c) => sum + c.amount,
		0,
	);

	return (
		<>
			<DetailSection title="Summary">
				<FieldGroup columns={3}>
					<MetricDisplay
						label="Total Collected"
						value={totalCollected}
						format="currency"
						secondary={`${employee.paymentsCollected.length} payments`}
					/>
					<MetricDisplay
						label="Cash Handoffs"
						value={totalCash}
						format="currency"
						secondary={`${employee.cashCollections.length} transactions`}
					/>
					<MetricDisplay
						label="Expenses"
						value={totalExpenses}
						format="currency"
						secondary={`${employee.expensesSubmitted.length} submitted`}
					/>
				</FieldGroup>
			</DetailSection>

			<PaymentsSection
				employee={employee}
				organizationSlug={organizationSlug}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<DetailSection
					title="Cash Collections"
					description="Cash handed off or returned"
				>
					{employee.cashCollections.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No cash collections.
						</p>
					) : (
						<div className="space-y-2">
							{employee.cashCollections.map((c) => (
								<div
									key={c.id}
									className="flex items-center justify-between rounded-lg border p-3"
								>
									<div>
										<p className="text-sm font-medium tabular-nums">
											{formatCurrency(c.amount)}
										</p>
										<p className="text-xs text-muted-foreground">
											{new Date(
												c.collectedAt,
											).toLocaleDateString("en-GB")}
											{c.notes && ` — ${c.notes}`}
										</p>
									</div>
									<Badge variant="outline">
										{CASH_TYPE_LABELS[c.type] ?? c.type}
									</Badge>
								</div>
							))}
						</div>
					)}
				</DetailSection>

				<DetailSection
					title="Expenses"
					description="Expenses submitted by this employee"
				>
					{employee.expensesSubmitted.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No expenses submitted.
						</p>
					) : (
						<div className="space-y-2">
							{employee.expensesSubmitted.map((e) => (
								<div
									key={e.id}
									className="flex items-center justify-between rounded-lg border p-3"
								>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium tabular-nums">
											{formatCurrency(e.amount)}
										</p>
										<p className="text-xs text-muted-foreground truncate">
											{e.description}
										</p>
									</div>
									<Badge
										variant="outline"
										className="shrink-0 ml-2"
									>
										{EXPENSE_STATUS_LABELS[e.status] ??
											e.status}
									</Badge>
								</div>
							))}
						</div>
					)}
				</DetailSection>
			</div>
		</>
	);
}

// ─── Inventory Tab ─────────────────────────────────────────────────────

type WorkerStock = EmployeeData["workerStock"][number];
type Installation = EmployeeData["installationsDone"][number];

const stockColumns: ColumnDef<WorkerStock, unknown>[] = [
	{
		accessorFn: (row) => row.stockItem.name,
		id: "item",
		header: "Item",
		cell: ({ row }) => (
			<span className="text-sm font-medium">
				{row.original.stockItem.name}
			</span>
		),
	},
	{
		accessorKey: "quantity",
		header: "Qty",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="text-sm tabular-nums">
				{row.original.quantity}
			</span>
		),
	},
	{
		accessorKey: "unitPrice",
		header: "Unit Price",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="text-sm tabular-nums">
				{formatCurrency(row.original.unitPrice)}
			</span>
		),
	},
	{
		id: "total",
		header: "Total",
		meta: { className: "text-right" },
		cell: ({ row }) => (
			<span className="text-sm font-medium tabular-nums">
				{formatCurrency(row.original.quantity * row.original.unitPrice)}
			</span>
		),
	},
];

function useInstallationColumns(organizationSlug: string) {
	return useMemo<ColumnDef<Installation, unknown>[]>(
		() => [
			{
				accessorFn: (row) => row.customer.firstName,
				id: "customer",
				header: "Customer",
				cell: ({ row }) => {
					const inst = row.original;
					return (
						<div>
							<Link
								to="/app/$organizationSlug/customers/$customerId"
								params={{
									organizationSlug,
									customerId: inst.customer.id,
								}}
								className="text-sm font-medium hover:underline"
								preload="intent"
							>
								{displayName(
									inst.customer.firstName,
									inst.customer.lastName,
								)}
							</Link>
							<p className="text-xs text-muted-foreground font-mono">
								{inst.customer.accountNumber}
							</p>
						</div>
					);
				},
			},
			{
				accessorFn: (row) => row.stockItem?.name,
				id: "item",
				header: "Item",
				meta: { className: "hidden sm:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{row.original.stockItem?.name ?? "-"}
						{row.original.quantity > 1 &&
							` x${row.original.quantity}`}
					</span>
				),
			},
			{
				accessorKey: "price",
				header: "Price",
				meta: { className: "hidden md:table-cell text-right" },
				cell: ({ row }) => (
					<span className="text-sm tabular-nums">
						{formatCurrency(row.original.price)}
					</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => (
					<Badge variant="outline">
						{INSTALLATION_STATUS_LABELS[row.original.status] ??
							row.original.status}
					</Badge>
				),
			},
			{
				accessorKey: "installedAt",
				header: "Date",
				meta: { className: "hidden md:table-cell" },
				cell: ({ row }) => (
					<span className="text-sm">
						{new Date(row.original.installedAt).toLocaleDateString(
							"en-GB",
						)}
					</span>
				),
			},
		],
		[organizationSlug],
	);
}

function InventoryTab({
	employee,
	organizationSlug,
}: {
	employee: EmployeeData;
	organizationSlug: string;
}) {
	const installationColumns = useInstallationColumns(organizationSlug);

	const totalStockValue = employee.workerStock.reduce(
		(sum, s) => sum + s.quantity * s.unitPrice,
		0,
	);

	return (
		<>
			{employee.workerStock.length > 0 && (
				<DetailSection
					title="Assigned Stock"
					description="Inventory items currently held by this employee"
				>
					<div className="mb-4">
						<MetricDisplay
							label="Total Stock Value"
							value={totalStockValue}
							format="currency"
							secondary={`${employee.workerStock.length} item${employee.workerStock.length !== 1 ? "s" : ""}`}
						/>
					</div>
					<DataTable
						columns={stockColumns}
						data={employee.workerStock}
						pageSize={10}
					/>
				</DetailSection>
			)}

			<DetailSection
				title="Installations"
				description="Recent installations performed by this employee"
			>
				<DataTable
					columns={installationColumns}
					data={employee.installationsDone}
					pageSize={10}
					emptyState={
						<p className="text-sm text-muted-foreground">
							No installations recorded.
						</p>
					}
				/>
			</DetailSection>
		</>
	);
}
