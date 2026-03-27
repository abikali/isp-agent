"use client";

import { emailSchema } from "@repo/api/lib/validation";
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
import { toast } from "sonner";
import { useCreateDealer, useDealersQuery } from "../hooks/use-dealers";

export function CreateDealerDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const createDealer = useCreateDealer();
	const { dealers: parentDealers } = useDealersQuery();

	const form = useForm({
		defaultValues: {
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
			if (!organizationId) {
				return;
			}
			try {
				await createDealer.mutateAsync({
					organizationId,
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Dealer</DialogTitle>
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

					<div className="grid grid-cols-2 gap-4">
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
											field.handleChange(e.target.value)
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
												errors={field.state.meta.errors}
											/>
										)}
									</div>
								);
							}}
						</form.Field>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="phone">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="dealer-phone">Phone</Label>
									<Input
										id="dealer-phone"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
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
											field.handleChange(e.target.value)
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

					<div className="grid grid-cols-2 gap-4">
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
											field.handleChange(e.target.value)
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
											field.handleChange(e.target.value)
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
											<SelectItem key={d.id} value={d.id}>
												{d.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
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
							{isSubmitting ? "Creating..." : "Add Dealer"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
