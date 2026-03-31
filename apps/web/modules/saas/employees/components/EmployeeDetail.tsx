"use client";

import { isValidEmail } from "@repo/api/lib/validation";
import { DetailPanel, DetailSection } from "@shared/components/DetailPanel";
import { FieldGroup } from "@shared/components/FieldGroup";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { FieldError } from "@ui/components/field";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { Textarea } from "@ui/components/textarea";
import {
	CheckCircle2Icon,
	ClipboardListIcon,
	LogInIcon,
	PlusIcon,
	UserIcon,
} from "lucide-react";
import { useState } from "react";
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

const TASK_STATUS_LABELS: Record<string, string> = {
	OPEN: "Open",
	IN_PROGRESS: "In Progress",
	ON_HOLD: "On Hold",
	COMPLETED: "Completed",
	CANCELLED: "Cancelled",
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
	LOW: "Low",
	MEDIUM: "Medium",
	HIGH: "High",
	URGENT: "Urgent",
};

export function EmployeeDetail({ employeeId }: { employeeId: string }) {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });
	const updateEmployee = useUpdateEmployee();
	const deleteEmployee = useDeleteEmployee();
	const inviteEmployee = useInviteEmployee();
	const [showAssignStations, setShowAssignStations] = useState(false);
	const [showInvite, setShowInvite] = useState(false);
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
		defaultValues: {
			name: employee.name,
			email: employee.email ?? "",
			phone: employee.phone ?? "",
			position: employee.position ?? "",
			department: employee.department ?? "",
			hireDate: employee.hireDate
				? (new Date(employee.hireDate).toISOString().split("T")[0] ??
					"")
				: "",
			status: employee.status,
			preferredLayout: employee.preferredLayout ?? "standard",
			telegramChatId: employee.telegramChatId ?? "",
			notes: employee.notes ?? "",
		},
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
					{employee.iRadiusProfile && (
						<Badge variant="outline">
							{employee.iRadiusProfile}
						</Badge>
					)}
				</span>
			}
			actions={
				<div className="flex flex-wrap gap-2">
					{employee.userId ? (
						<Badge
							variant="outline"
							className="flex items-center gap-1 px-3 py-1.5"
						>
							<CheckCircle2Icon className="size-3 text-green-600" />
							Has login
						</Badge>
					) : (
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
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							if (
								organizationId &&
								confirm("Deactivate this employee?")
							) {
								deleteEmployee.mutate({
									organizationId,
									id: employeeId,
								});
							}
						}}
					>
						Deactivate
					</Button>
					<Button
						form="employee-detail-form"
						type="submit"
						size="sm"
						disabled={isSaving}
					>
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			}
		>
			<form
				id="employee-detail-form"
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
								<>
									{/* ── Personal Information ── */}
									<DetailSection
										title="Personal Information"
										description="Basic contact details for this employee."
									>
										<FieldGroup columns={3}>
											<form.Field name="name">
												{(field) => (
													<div className="space-y-2">
														<Label htmlFor="emp-name">
															Name *
														</Label>
														<Input
															id="emp-name"
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
															placeholder="Full name"
														/>
													</div>
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
														field.state.meta
															.isTouched &&
														field.state.meta.errors
															.length > 0;
													return (
														<div className="space-y-2">
															<Label htmlFor="emp-email">
																Email
															</Label>
															<Input
																id="emp-email"
																type="email"
																value={
																	field.state
																		.value
																}
																onChange={(e) =>
																	field.handleChange(
																		e.target
																			.value,
																	)
																}
																onBlur={
																	field.handleBlur
																}
																aria-invalid={
																	hasErrors ||
																	undefined
																}
																placeholder="email@example.com"
															/>
															{hasErrors && (
																<FieldError
																	errors={
																		field
																			.state
																			.meta
																			.errors
																	}
																/>
															)}
														</div>
													);
												}}
											</form.Field>
											<form.Field name="phone">
												{(field) => (
													<div className="space-y-2">
														<Label htmlFor="emp-phone">
															Phone
														</Label>
														<Input
															id="emp-phone"
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
															placeholder="+961 ..."
														/>
													</div>
												)}
											</form.Field>
										</FieldGroup>
									</DetailSection>

									{/* ── Employment Details ── */}
									<DetailSection
										title="Employment"
										description="Role, department, and employment status."
									>
										<FieldGroup columns={2}>
											<form.Field name="position">
												{(field) => (
													<div className="space-y-2">
														<Label htmlFor="emp-position">
															Position
														</Label>
														<Input
															id="emp-position"
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
															placeholder="e.g. Network Technician"
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="department">
												{(field) => (
													<div className="space-y-2">
														<Label>
															Department
														</Label>
														<Select
															value={
																field.state
																	.value
															}
															onValueChange={
																field.handleChange
															}
														>
															<SelectTrigger>
																<SelectValue placeholder="Select department" />
															</SelectTrigger>
															<SelectContent>
																{EMPLOYEE_DEPARTMENT_OPTIONS.map(
																	(opt) => (
																		<SelectItem
																			key={
																				opt.value
																			}
																			value={
																				opt.value
																			}
																		>
																			{
																				opt.label
																			}
																		</SelectItem>
																	),
																)}
															</SelectContent>
														</Select>
													</div>
												)}
											</form.Field>
											<form.Field name="hireDate">
												{(field) => (
													<div className="space-y-2">
														<Label htmlFor="emp-hire">
															Hire Date
														</Label>
														<Input
															id="emp-hire"
															type="date"
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="status">
												{(field) => (
													<div className="space-y-2">
														<Label>Status</Label>
														<Select
															value={
																field.state
																	.value
															}
															onValueChange={(
																v,
															) =>
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
																			key={
																				opt.value
																			}
																			value={
																				opt.value
																			}
																		>
																			{
																				opt.label
																			}
																		</SelectItem>
																	),
																)}
															</SelectContent>
														</Select>
													</div>
												)}
											</form.Field>
										</FieldGroup>
									</DetailSection>

									{/* ── Portal & Notifications ── */}
									<DetailSection
										title="Portal & Notifications"
										description="Configure how this employee interacts with the system."
									>
										<FieldGroup columns={2}>
											<form.Field name="preferredLayout">
												{(field) => (
													<div className="space-y-2">
														<Label>
															Portal Layout
														</Label>
														<Select
															value={
																field.state
																	.value
															}
															onValueChange={
																field.handleChange
															}
														>
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="standard">
																	Standard
																	Dashboard
																</SelectItem>
																<SelectItem value="collector">
																	Collector
																	Portal
																</SelectItem>
															</SelectContent>
														</Select>
														<p className="text-xs text-muted-foreground">
															Collector portal
															shows a simplified
															mobile-friendly
															interface for
															payment collection.
														</p>
													</div>
												)}
											</form.Field>
											<form.Field name="telegramChatId">
												{(field) => (
													<div className="space-y-2">
														<Label htmlFor="emp-telegram">
															Telegram Chat ID
														</Label>
														<Input
															id="emp-telegram"
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
															placeholder="e.g. 123456789"
														/>
														<p className="text-xs text-muted-foreground">
															Used to send
															notifications via
															Telegram bot.
														</p>
													</div>
												)}
											</form.Field>
										</FieldGroup>
									</DetailSection>

									{/* ── Notes ── */}
									<DetailSection title="Notes">
										<form.Field name="notes">
											{(field) => (
												<Textarea
													value={field.state.value}
													onChange={(e) =>
														field.handleChange(
															e.target.value,
														)
													}
													rows={3}
													placeholder="Internal notes about this employee..."
												/>
											)}
										</form.Field>
									</DetailSection>

									{/* ── iRadius / External System Info (read-only) ── */}
									{(employee.externalId ||
										employee.dealer) && (
										<DetailSection
											title="External System"
											description="Synced from iRadius. These fields are read-only."
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
																	value: employee
																		.dealer
																		.name,
																},
															]
														: []),
												]}
											/>
										</DetailSection>
									)}
								</>
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
								<>
									<DetailSection
										title="Assigned Stations"
										description="Stations this employee can access and manage."
										action={
											<Button
												variant="outline"
												size="sm"
												type="button"
												onClick={() =>
													setShowAssignStations(true)
												}
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
											<div className="space-y-2">
												{employee.stations.map((es) => (
													<div
														key={es.station.id}
														className="flex items-center justify-between rounded-lg p-3 shadow-card"
													>
														<div>
															<p className="text-sm font-medium">
																{
																	es.station
																		.name
																}
															</p>
															{es.station
																.address && (
																<p className="text-xs text-muted-foreground">
																	{
																		es
																			.station
																			.address
																	}
																</p>
															)}
														</div>
														<Badge variant="outline">
															{es.station.status}
														</Badge>
													</div>
												))}
											</div>
										)}
									</DetailSection>

									<DetailSection
										title="Assigned Tasks"
										description="Recent tasks assigned to this employee."
									>
										{employee.taskAssignments.length ===
										0 ? (
											<p className="text-sm text-muted-foreground">
												No tasks assigned.
											</p>
										) : (
											<div className="rounded-xl shadow-card overflow-hidden">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>
																Title
															</TableHead>
															<TableHead>
																Status
															</TableHead>
															<TableHead className="hidden md:table-cell">
																Priority
															</TableHead>
															<TableHead className="hidden md:table-cell">
																Due Date
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{employee.taskAssignments.map(
															(ta) => (
																<TableRow
																	key={
																		ta.task
																			.id
																	}
																>
																	<TableCell>
																		<Link
																			to={
																				ta
																					.task
																					.source ===
																				"AI_ESCALATION"
																					? "/app/$organizationSlug/escalations/$taskId"
																					: "/app/$organizationSlug/tasks/$taskId"
																			}
																			params={{
																				organizationSlug:
																					organizationSlug ??
																					"",
																				taskId: ta
																					.task
																					.id,
																			}}
																			className="text-sm font-medium hover:underline"
																			preload="intent"
																		>
																			{
																				ta
																					.task
																					.title
																			}
																		</Link>
																	</TableCell>
																	<TableCell>
																		<Badge variant="outline">
																			{TASK_STATUS_LABELS[
																				ta
																					.task
																					.status
																			] ??
																				ta
																					.task
																					.status}
																		</Badge>
																	</TableCell>
																	<TableCell className="hidden md:table-cell">
																		{TASK_PRIORITY_LABELS[
																			ta
																				.task
																				.priority
																		] ??
																			ta
																				.task
																				.priority}
																	</TableCell>
																	<TableCell className="hidden text-sm md:table-cell">
																		{ta.task
																			.dueDate
																			? new Date(
																					ta
																						.task
																						.dueDate,
																				).toLocaleDateString()
																			: "-"}
																	</TableCell>
																</TableRow>
															),
														)}
													</TableBody>
												</Table>
											</div>
										)}
									</DetailSection>
								</>
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

			{/* Invite to Login Dialog */}
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
						<div>
							<Label>Username</Label>
							<Input
								value={inviteUsername}
								onChange={(e) =>
									setInviteUsername(e.target.value)
								}
								placeholder="Login username"
							/>
						</div>
						<div>
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
		</PageShell>
	);
}
