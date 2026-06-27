"use client";

import { emailSchema } from "@repo/api/lib/validation";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
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
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { toast } from "sonner";
import { useCreateEmployee } from "../hooks/use-employees";
import { EMPLOYEE_DEPARTMENT_OPTIONS } from "../lib/constants";

export function CreateEmployeeDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createEmployee = useCreateEmployee();

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			phone: "",
			position: "",
			department: "",
			hireDate: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			try {
				await createEmployee.mutateAsync({
					organizationId,
					name: value.name,
					email: value.email || undefined,
					phone: value.phone || undefined,
					position: value.position || undefined,
					department: (value.department || undefined) as
						| "TECHNICAL"
						| "CUSTOMER_SERVICE"
						| "BILLING"
						| "MANAGEMENT"
						| "FIELD_OPS"
						| undefined,
					hireDate: value.hireDate
						? new Date(value.hireDate)
						: undefined,
					notes: value.notes || undefined,
				});
				toast.success("Employee created");
				onOpenChange(false);
				form.reset();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create employee",
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
					<SheetTitle>Add Employee</SheetTitle>
				</SheetHeader>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form (SPA) requires client-side onSubmit with preventDefault; no server-action equivalent */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-1 flex-col overflow-hidden"
				>
					<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
						<form.Field name="name">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="emp-name">Name *</Label>
									<Input
										id="emp-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Full name"
									/>
								</div>
							)}
						</form.Field>

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field
								name="email"
								validators={{
									onBlur: emailSchema,
								}}
							>
								{(field) => {
									const hasErrors =
										field.state.meta.isTouched &&
										field.state.meta.errors.length > 0;
									return (
										<div className="space-y-2">
											<Label htmlFor="emp-email">
												Email
											</Label>
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
											/>
											{hasErrors && (
												<FieldError
													errors={
														field.state.meta.errors
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
										<Label htmlFor="emp-phone">Phone</Label>
										<Input
											id="emp-phone"
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

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="position">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="emp-position">
											Position
										</Label>
										<Input
											id="emp-position"
											value={field.state.value}
											onChange={(e) =>
												field.handleChange(
													e.target.value,
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
										<Label>Department</Label>
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
									</div>
								)}
							</form.Field>
						</div>

						<form.Field name="hireDate">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="emp-hire">Hire Date</Label>
									<Input
										id="emp-hire"
										type="date"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="notes">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="emp-notes">Notes</Label>
									<Textarea
										id="emp-notes"
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
							{isSubmitting ? "Creating..." : "Add Employee"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
