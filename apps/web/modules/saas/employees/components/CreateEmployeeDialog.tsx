"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
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
				hireDate: value.hireDate ? new Date(value.hireDate) : undefined,
				notes: value.notes || undefined,
			});
			onOpenChange(false);
			form.reset();
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Employee</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
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

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="email">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="emp-email">Email</Label>
									<Input
										id="emp-email"
										type="email"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>
						<form.Field name="phone">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="emp-phone">Phone</Label>
									<Input
										id="emp-phone"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<div className="grid grid-cols-2 gap-4">
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
											field.handleChange(e.target.value)
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

					<DialogFooter>
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
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
