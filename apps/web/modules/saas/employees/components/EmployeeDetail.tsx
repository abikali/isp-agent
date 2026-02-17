"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
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
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useDeleteEmployee, useUpdateEmployee } from "../hooks/use-employees";
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
	const [showAssignStations, setShowAssignStations] = useState(false);

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
			notes: employee.notes ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await updateEmployee.mutateAsync({
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
				notes: value.notes || null,
			});
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">{employee.name}</h1>
					<div className="flex items-center gap-3 text-muted-foreground">
						<span className="font-mono text-sm">
							{employee.employeeNumber}
						</span>
						<Badge>
							{EMPLOYEE_STATUS_LABELS[employee.status] ??
								employee.status}
						</Badge>
					</div>
				</div>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<div className="grid gap-6 lg:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Personal Information
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="name">
								{(field) => (
									<div className="space-y-2">
										<Label>Name</Label>
										<Input
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
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="email">
									{(field) => (
										<div className="space-y-2">
											<Label>Email</Label>
											<Input
												type="email"
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
								<form.Field name="phone">
									{(field) => (
										<div className="space-y-2">
											<Label>Phone</Label>
											<Input
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
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Employment
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="position">
									{(field) => (
										<div className="space-y-2">
											<Label>Position</Label>
											<Input
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
								<form.Field name="department">
									{(field) => (
										<div className="space-y-2">
											<Label>Department</Label>
											<Select
												value={field.state.value}
												onValueChange={
													field.handleChange
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="None" />
												</SelectTrigger>
												<SelectContent>
													{EMPLOYEE_DEPARTMENT_OPTIONS.map(
														(opt) => (
															<SelectItem
																key={opt.value}
																value={
																	opt.value
																}
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
							</div>
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="hireDate">
									{(field) => (
										<div className="space-y-2">
											<Label>Hire Date</Label>
											<Input
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
								<form.Field name="status">
									{(field) => (
										<div className="space-y-2">
											<Label>Status</Label>
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
																value={
																	opt.value
																}
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
							</div>
						</CardContent>
					</Card>

					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle className="text-base">Notes</CardTitle>
						</CardHeader>
						<CardContent>
							<form.Field name="notes">
								{(field) => (
									<Textarea
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										rows={4}
									/>
								)}
							</form.Field>
						</CardContent>
					</Card>
				</div>

				<div className="mt-6 flex items-center justify-between">
					<Button
						type="button"
						variant="destructive"
						onClick={() => {
							if (
								organizationId &&
								confirm(
									"Deactivate this employee? They will be set to Inactive.",
								)
							) {
								deleteEmployee.mutate({
									organizationId,
									id: employeeId,
								});
							}
						}}
					>
						Deactivate Employee
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>

			{/* Assigned Stations */}
			<Card className="mt-6">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-base">
						Assigned Stations
					</CardTitle>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowAssignStations(true)}
					>
						<PlusIcon className="mr-1 size-3" />
						Assign
					</Button>
				</CardHeader>
				<CardContent>
					{employee.stations.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No stations assigned.
						</p>
					) : (
						<div className="space-y-2">
							{employee.stations.map((es) => (
								<div
									key={es.station.id}
									className="flex items-center justify-between rounded-md border p-3"
								>
									<div>
										<p className="text-sm font-medium">
											{es.station.name}
										</p>
										{es.station.address && (
											<p className="text-xs text-muted-foreground">
												{es.station.address}
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
				</CardContent>
			</Card>

			{/* Assigned Tasks */}
			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-base">Assigned Tasks</CardTitle>
				</CardHeader>
				<CardContent>
					{employee.taskAssignments.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No tasks assigned.
						</p>
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="hidden md:table-cell">
											Priority
										</TableHead>
										<TableHead className="hidden md:table-cell">
											Due Date
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{employee.taskAssignments.map((ta) => (
										<TableRow key={ta.task.id}>
											<TableCell>
												<Link
													to="/app/$organizationSlug/tasks/$taskId"
													params={{
														organizationSlug:
															organizationSlug ??
															"",
														taskId: ta.task.id,
													}}
													className="text-sm font-medium hover:underline"
													preload="intent"
												>
													{ta.task.title}
												</Link>
											</TableCell>
											<TableCell>
												<Badge variant="outline">
													{TASK_STATUS_LABELS[
														ta.task.status
													] ?? ta.task.status}
												</Badge>
											</TableCell>
											<TableCell className="hidden md:table-cell">
												{TASK_PRIORITY_LABELS[
													ta.task.priority
												] ?? ta.task.priority}
											</TableCell>
											<TableCell className="hidden text-sm md:table-cell">
												{ta.task.dueDate
													? new Date(
															ta.task.dueDate,
														).toLocaleDateString()
													: "-"}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<AssignStationDialog
				open={showAssignStations}
				onOpenChange={setShowAssignStations}
				employeeId={employeeId}
				currentStationIds={employee.stations.map((es) => es.station.id)}
			/>
		</div>
	);
}
