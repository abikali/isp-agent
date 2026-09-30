"use client";

import { useBasesQuery, useStationsQuery } from "@saas/customers/client";
import { PageShell } from "@shared/components/PageShell";
import { formatDateInput, formatTimeInput } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
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
import { Textarea } from "@ui/components/textarea";
import { toast } from "sonner";
import { useUpdateTask } from "../hooks/use-tasks";
import {
	TASK_CATEGORY_OPTIONS,
	TASK_PRIORITY_OPTIONS,
	TASK_STATUS_OPTIONS,
} from "../lib/constants";
import { toDuePayload } from "../lib/task-utils";
import { TaskEvidenceCard } from "./TaskEvidenceCard";

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single-purpose TanStack Form edit page; splitting would scatter shared form state
export function TaskDetail({
	taskId,
	backPath = "/app/$organizationSlug/tasks/$taskId",
}: {
	taskId: string;
	backPath?: string;
}) {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });
	const updateTask = useUpdateTask();
	const { bases } = useBasesQuery();
	const { stations } = useStationsQuery();

	const { data } = useSuspenseQuery(
		orpc.tasks.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				id: taskId,
			},
		}),
	);

	const task = data.task;
	const initialDueDate = task.dueDate ? formatDateInput(task.dueDate) : "";
	const initialDueTime =
		task.dueDate && task.dueHasTime ? formatTimeInput(task.dueDate) : "";

	const form = useForm({
		defaultValues: {
			title: task.title,
			description: task.description ?? "",
			status: task.status,
			priority: task.priority,
			category: task.category,
			dueDate: initialDueDate,
			dueTime: initialDueTime,
			baseId: task.baseId ?? "",
			stationId: task.stationId ?? "",
			notes: task.notes ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			try {
				await updateTask.mutateAsync({
					organizationId,
					id: taskId,
					title: value.title,
					description: value.description || null,
					status: value.status as "OPEN" | "COMPLETED" | "CANCELLED",
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
					// Only when edited: re-sending an untouched legacy
					// (UTC-midnight) date would count as a reschedule.
					...(value.dueDate !== initialDueDate ||
					value.dueTime !== initialDueTime
						? toDuePayload(value.dueDate, value.dueTime)
						: {}),
					baseId: value.baseId || null,
					stationId: value.stationId || null,
					notes: value.notes || null,
				});
				toast.success("Task updated");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update task",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	const resolvedBackPath = backPath
		.replace("$organizationSlug", organizationSlug ?? "")
		.replace("$taskId", taskId);

	return (
		<PageShell title="Edit task" backTo={resolvedBackPath} backLabel="Task">
			{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- canonical TanStack Form submit; not a server-action form */}
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
							<div className="grid gap-4 sm:grid-cols-2">
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
							<div className="grid gap-4 sm:grid-cols-2">
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
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Base & Notes
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<form.Field name="baseId">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="task-edit-base">
											Base
										</Label>
										<Combobox
											id="task-edit-base"
											value={field.state.value || "none"}
											onChange={(v) =>
												field.handleChange(
													v === "none" ? "" : v,
												)
											}
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
										<Label htmlFor="task-edit-station">
											Station
										</Label>
										<Combobox
											id="task-edit-station"
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
												...stations.map((st) => ({
													value: st.id,
													label: st.name,
												})),
											]}
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="notes">
								{(field) => (
									<div className="space-y-2">
										<Label>Notes</Label>
										<Textarea
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
												)
											}
											rows={6}
											placeholder="Add internal notes about this task..."
										/>
									</div>
								)}
							</form.Field>
						</CardContent>
					</Card>

					<TaskEvidenceCard task={task} />
				</div>

				<div className="mt-6 flex items-center justify-end gap-3">
					<Link
						to={backPath}
						params={{
							organizationSlug: organizationSlug ?? "",
							taskId,
						}}
						preload="intent"
					>
						<Button type="button" variant="outline">
							Cancel
						</Button>
					</Link>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>
		</PageShell>
	);
}
