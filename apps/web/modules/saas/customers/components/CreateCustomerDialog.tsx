"use client";

import { emailSchema } from "@repo/api/lib/validation";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { FieldError } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PhoneInput } from "@ui/components/phone-input";
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
import { PlusIcon, XIcon } from "lucide-react";
import { useCreateCustomer } from "../hooks/use-customers";
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";

const MAX_PHONES = 5;

// biome-ignore lint/suspicious/noExplicitAny: TanStack Form generic types are complex; the form shape is known at usage site
function PhoneFieldsCreate({ form }: { form: any }) {
	const phones: Array<{ number: string; primary: boolean }> =
		form.getFieldValue("phones") ?? [{ number: "", primary: true }];

	function updatePhones(
		updated: Array<{ number: string; primary: boolean }>,
	) {
		form.setFieldValue("phones", updated);
	}

	return (
		<div className="space-y-2">
			<Label>Phone Numbers</Label>
			<div className="space-y-2">
				{phones.map((phone, index) => (
					<div key={index} className="flex items-center gap-1.5">
						<PhoneInput
							value={phone.number}
							onChange={(val: string) => {
								const updated = phones.map((p, i) =>
									i === index ? { ...p, number: val } : p,
								);
								updatePhones(updated);
							}}
							className="flex-1 min-w-0"
						/>
						{phones.length > 1 && (
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="shrink-0 size-9 text-destructive border-destructive/30 hover:bg-destructive/10"
								onClick={() => {
									const updated = phones.filter(
										(_, i) => i !== index,
									);
									const first = updated[0];
									if (phones[index]?.primary && first) {
										updated[0] = {
											...first,
											primary: true,
										};
									}
									updatePhones(updated);
								}}
							>
								<XIcon className="size-4" />
							</Button>
						)}
					</div>
				))}
				{phones.length < MAX_PHONES && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-7 text-xs"
						onClick={() =>
							updatePhones([
								...phones,
								{ number: "", primary: false },
							])
						}
					>
						<PlusIcon className="size-3.5 mr-1" />
						Add phone
					</Button>
				)}
			</div>
		</div>
	);
}

export function CreateCustomerDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createCustomer = useCreateCustomer();
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();

	const form = useForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			email: "",
			phones: [{ number: "", primary: true }] as Array<{
				number: string;
				primary: boolean;
			}>,
			address: "",
			username: "",
			planId: "",
			stationId: "",
			status: "ACTIVE",
			connectionType: "",
			monthlyRate: "",
			groupName: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await createCustomer.mutateAsync({
				organizationId,
				firstName: value.firstName,
				lastName: value.lastName || undefined,
				email: value.email || undefined,
				phones: value.phones.filter((p) => p.number.trim() !== ""),
				address: value.address || undefined,
				username: value.username || undefined,
				planId: value.planId || undefined,
				stationId: value.stationId || undefined,
				status: value.status as
					| "ACTIVE"
					| "INACTIVE"
					| "SUSPENDED"
					| "PENDING",
				connectionType: (value.connectionType || undefined) as
					| "FIBER"
					| "WIRELESS"
					| "DSL"
					| "CABLE"
					| "ETHERNET"
					| undefined,
				monthlyRate: value.monthlyRate
					? Number(value.monthlyRate)
					: undefined,
				groupName: value.groupName || undefined,
				notes: value.notes || undefined,
			});
			onOpenChange(false);
			form.reset();
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>Add Customer</SheetTitle>
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
						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="firstName">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="cust-fname">
											First Name *
										</Label>
										<Input
											id="cust-fname"
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
							<form.Field name="lastName">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="cust-lname">
											Last Name
										</Label>
										<Input
											id="cust-lname"
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
											<Label htmlFor="cust-email">
												Email
											</Label>
											<Input
												id="cust-email"
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
						</div>

						<PhoneFieldsCreate form={form} />

						<form.Field name="address">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-address">
										Address
									</Label>
									<Input
										id="cust-address"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="planId">
								{(field) => (
									<div className="space-y-2">
										<Label>Plan</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select plan" />
											</SelectTrigger>
											<SelectContent>
												{plans.map((p) => (
													<SelectItem
														key={p.id}
														value={p.id}
													>
														{p.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
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
												<SelectValue placeholder="Select station" />
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

						<div className="grid gap-4 sm:grid-cols-2">
							<form.Field name="status">
								{(field) => (
									<div className="space-y-2">
										<Label>Status</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{CUSTOMER_STATUS_OPTIONS.map(
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
							<form.Field name="connectionType">
								{(field) => (
									<div className="space-y-2">
										<Label>Connection Type</Label>
										<Select
											value={field.state.value}
											onValueChange={field.handleChange}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select type" />
											</SelectTrigger>
											<SelectContent>
												{CONNECTION_TYPE_OPTIONS.map(
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

						<form.Field name="username">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-user">
										PPPoE Username
									</Label>
									<Input
										id="cust-user"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="groupName">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-group">Group</Label>
									<Input
										id="cust-group"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="e.g. Residential, Business"
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="monthlyRate">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-rate">
										Monthly Rate Override ($)
									</Label>
									<Input
										id="cust-rate"
										type="number"
										min={0}
										step="0.01"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Use plan price"
									/>
								</div>
							)}
						</form.Field>

						<form.Field name="notes">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-notes">Notes</Label>
									<Textarea
										id="cust-notes"
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
							{isSubmitting ? "Creating..." : "Add Customer"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
