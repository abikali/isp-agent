"use client";

import { useStationsQuery } from "@saas/customers/client";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
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
import { Textarea } from "@ui/components/textarea";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useDeleteTask, useUpdateTask } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_OPTIONS,
	TASK_PRIORITY_LABELS,
	TASK_PRIORITY_OPTIONS,
	TASK_STATUS_LABELS,
	TASK_STATUS_OPTIONS,
} from "../lib/constants";
import { AssignEmployeeDialog } from "./AssignEmployeeDialog";

export function TaskDetail({ taskId }: { taskId: string }) {
	const organizationId = useOrganizationId();
	const updateTask = useUpdateTask();
	const deleteTask = useDeleteTask();
	const { stations } = useStationsQuery();
	const [showAssignEmployees, setShowAssignEmployees] = useState(false);

	const { data } = useSuspenseQuery(
		orpc.tasks.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				id: taskId,
			},
		}),
	);

	const task = data.task;

	const form = useForm({
		defaultValues: {
			title: task.title,
			description: task.description ?? "",
			status: task.status,
			priority: task.priority,
			category: task.category,
			dueDate: task.dueDate
				? (new Date(task.dueDate).toISOString().split("T")[0] ?? "")
				: "",
			stationId: task.stationId ?? "",
			notes: task.notes ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await updateTask.mutateAsync({
				organizationId,
				id: taskId,
				title: value.title,
				description: value.description || null,
				status: value.status as
					| "OPEN"
					| "IN_PROGRESS"
					| "ON_HOLD"
					| "COMPLETED"
					| "CANCELLED",
				priority: value.priority as
					| "LOW"
					| "MEDIUM"
					| "HIGH"
					| "URGENT",
				category: value.category as
					| "INSTALLATION"
					| "MAINTENANCE"
					| "REPAIR"
					| "SUPPORT"
					| "BILLING"
					| "GENERAL",
				dueDate: value.dueDate ? new Date(value.dueDate) : null,
				stationId: value.stationId || null,
				notes: value.notes || null,
			});
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<div>
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">{task.title}</h1>
					<div className="flex items-center gap-3 mt-1">
						<Badge>
							{TASK_STATUS_LABELS[task.status] ?? task.status}
						</Badge>
						<Badge variant="outline">
							{TASK_PRIORITY_LABELS[task.priority] ??
								task.priority}
						</Badge>
						{task.createdBy && (
							<span className="text-sm text-muted-foreground">
								Created by {task.createdBy.name}
							</span>
						)}
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
								Task Details
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="title">
								{(field) => (
									<div className="space-y-2">
										<Label>Title</Label>
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
							<form.Field name="description">
								{(field) => (
									<div className="space-y-2">
										<Label>Description</Label>
										<Textarea
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											rows={3}
										/>
									</div>
								)}
							</form.Field>
							<div className="grid grid-cols-2 gap-4">
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
													{TASK_STATUS_OPTIONS.map(
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
								<form.Field name="priority">
									{(field) => (
										<div className="space-y-2">
											<Label>Priority</Label>
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
													{TASK_PRIORITY_OPTIONS.map(
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
								<form.Field name="category">
									{(field) => (
										<div className="space-y-2">
											<Label>Category</Label>
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
													{TASK_CATEGORY_OPTIONS.map(
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
								<form.Field name="dueDate">
									{(field) => (
										<div className="space-y-2">
											<Label>Due Date</Label>
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
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Links</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{task.customer && (
								<div className="space-y-2">
									<Label>Customer</Label>
									<p className="text-sm">
										{task.customer.fullName}{" "}
										<span className="text-muted-foreground">
											({task.customer.accountNumber})
										</span>
									</p>
								</div>
							)}
							<form.Field name="stationId">
								{(field) => (
									<div className="space-y-2">
										<Label>Station</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue placeholder="No station" />
											</SelectTrigger>
											<SelectContent>
												{stations.map((s) => (
													<SelectItem
														key={s.id}
														value={s.id}
													>
														{s.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
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
									"Cancel this task? It will be set to Cancelled.",
								)
							) {
								deleteTask.mutate({
									organizationId,
									id: taskId,
								});
							}
						}}
					>
						Cancel Task
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>

			{/* Assigned Employees */}
			<Card className="mt-6">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-base">
						Assigned Employees
					</CardTitle>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowAssignEmployees(true)}
					>
						<PlusIcon className="mr-1 size-3" />
						Assign
					</Button>
				</CardHeader>
				<CardContent>
					{task.assignments.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No employees assigned.
						</p>
					) : (
						<div className="space-y-2">
							{task.assignments.map((a) => (
								<div
									key={a.employee.id}
									className="flex items-center justify-between rounded-md border p-3"
								>
									<div>
										<p className="text-sm font-medium">
											{a.employee.name}
										</p>
										<p className="text-xs text-muted-foreground">
											{a.employee.employeeNumber}
											{a.employee.position
												? ` - ${a.employee.position}`
												: ""}
										</p>
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			<AssignEmployeeDialog
				open={showAssignEmployees}
				onOpenChange={setShowAssignEmployees}
				taskId={taskId}
				currentEmployeeIds={task.assignments.map((a) => a.employee.id)}
			/>
		</div>
	);
}
