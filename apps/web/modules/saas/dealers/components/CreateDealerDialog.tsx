"use client";

import { emailSchema } from "@repo/api/lib/validation";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
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
import { toast } from "sonner";
import { useCreateDealer, useDealersQuery } from "../hooks/use-dealers";

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive create-dealer form dialog; its fields share one TanStack Form instance and splitting would scatter the form flow
export function CreateDealerDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const createDealer = useCreateDealer();
	const { dealers: parentDealers } = useDealersQuery();

	const { data: orgsData } = useQuery(
		orpc.admin.organizations.list.queryOptions({
			input: { limit: 100, offset: 0 },
		}),
	);
	const organizations = orgsData?.organizations ?? [];

	const form = useForm({
		defaultValues: {
			organizationId: "",
			name: "",
			username: "",
			email: "",
			phone: "",
			companyName: "",
			companyAddress: "",
			companyPhone: "",
			companyMobile: "",
			parentDealerId: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await createDealer.mutateAsync({
					organizationId:
						value.organizationId && value.organizationId !== "none"
							? value.organizationId
							: undefined,
					name: value.name,
					username: value.username || undefined,
					email: value.email || undefined,
					phone: value.phone || undefined,
					companyName: value.companyName || undefined,
					companyAddress: value.companyAddress || undefined,
					companyPhone: value.companyPhone || undefined,
					companyMobile: value.companyMobile || undefined,
					parentDealerId:
						value.parentDealerId && value.parentDealerId !== "none"
							? value.parentDealerId
							: undefined,
				});
				toast.success("Dealer created");
				onOpenChange(false);
				form.reset();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to create dealer",
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
					<SheetTitle>Add Dealer</SheetTitle>
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
						<form.Field name="organizationId">
							{(field) => (
								<div className="space-y-2">
									<Label>Organization</Label>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue placeholder="No organization (assign later)" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">
												No organization (assign later)
											</SelectItem>
											{organizations.map((org) => (
												<SelectItem
													key={org.id}
													value={org.id}
												>
													{org.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						<form.Field name="name">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="dealer-name">Name *</Label>
									<Input
										id="dealer-name"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Dealer name"
									/>
								</div>
							)}
						</form.Field>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<form.Field name="username">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="dealer-username">
											Username
										</Label>
										<Input
											id="dealer-username"
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
											<Label htmlFor="dealer-email">
												Email
											</Label>
											<Input
												id="dealer-email"
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

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<form.Field name="phone">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="dealer-phone">
											Phone
										</Label>
										<Input
											id="dealer-phone"
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
							<form.Field name="companyName">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="dealer-company">
											Company Name
										</Label>
										<Input
											id="dealer-company"
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

						<form.Field name="companyAddress">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="dealer-address">
										Company Address
									</Label>
									<Input
										id="dealer-address"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<form.Field name="companyPhone">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="dealer-cphone">
											Company Phone
										</Label>
										<Input
											id="dealer-cphone"
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
							<form.Field name="companyMobile">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor="dealer-cmobile">
											Company Mobile
										</Label>
										<Input
											id="dealer-cmobile"
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

						<form.Field name="parentDealerId">
							{(field) => (
								<div className="space-y-2">
									<Label>Parent Dealer</Label>
									<Select
										value={field.state.value}
										onValueChange={field.handleChange}
									>
										<SelectTrigger>
											<SelectValue placeholder="None" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">
												None
											</SelectItem>
											{parentDealers.map((d) => (
												<SelectItem
													key={d.id}
													value={d.id}
												>
													{d.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
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
							{isSubmitting ? "Creating..." : "Add Dealer"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
