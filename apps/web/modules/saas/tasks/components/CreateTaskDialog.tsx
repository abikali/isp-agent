"use client";

import { useStationsQuery } from "@saas/customers/client";
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
import { toast } from "sonner";
import { useCreateTask } from "../hooks/use-tasks";
import { TASK_CATEGORY_OPTIONS, TASK_PRIORITY_OPTIONS } from "../lib/constants";

export function CreateTaskDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createTask = useCreateTask();
	const { stations } = useStationsQuery();

	const form = useForm({
		defaultValues: {
			title: "",
			description: "",
			priority: "MEDIUM",
			category: "GENERAL",
			dueDate: "",
			stationId: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
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
					category: value.category as
						| "INSTALLATION"
						| "MAINTENANCE"
						| "REPAIR"
						| "SUPPORT"
						| "BILLING"
						| "GENERAL",
					dueDate: value.dueDate
						? new Date(value.dueDate)
						: undefined,
					stationId: value.stationId || undefined,
					notes: value.notes || undefined,
				});
				toast.success("Task created");
				onOpenChange(false);
				form.reset();
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

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Create Task</SheetTitle>
				</SheetHeader>
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
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="dueDate">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="task-due">
											Due Date
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
							<form.Field name="stationId">
								{(field) => (
									<div className="space-y-2">
										<Label>Station</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue placeholder="None" />
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
						</div>

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
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create Task"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
