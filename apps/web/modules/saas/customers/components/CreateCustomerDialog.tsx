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
import { useCreateCustomer } from "../hooks/use-customers";
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";

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
			fullName: "",
			email: "",
			phone: "",
			address: "",
			username: "",
			planId: "",
			stationId: "",
			status: "ACTIVE",
			connectionType: "",
			ipAddress: "",
			macAddress: "",
			monthlyRate: "",
			billingDay: "",
			notes: "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			await createCustomer.mutateAsync({
				organizationId,
				fullName: value.fullName,
				email: value.email || undefined,
				phone: value.phone || undefined,
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
				ipAddress: value.ipAddress || undefined,
				macAddress: value.macAddress || undefined,
				monthlyRate: value.monthlyRate
					? Number(value.monthlyRate)
					: undefined,
				billingDay: value.billingDay
					? Number(value.billingDay)
					: undefined,
				notes: value.notes || undefined,
			});
			onOpenChange(false);
			form.reset();
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Add Customer</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="fullName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="cust-name">Full Name *</Label>
								<Input
									id="cust-name"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>

					<div className="grid grid-cols-2 gap-4">
						<form.Field name="email">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-email">Email</Label>
									<Input
										id="cust-email"
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
									<Label htmlFor="cust-phone">Phone</Label>
									<Input
										id="cust-phone"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>
					</div>

					<form.Field name="address">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor="cust-address">Address</Label>
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

					<div className="grid grid-cols-2 gap-4">
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

					<div className="grid grid-cols-2 gap-4">
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

					<div className="grid grid-cols-2 gap-4">
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
						<form.Field name="ipAddress">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-ip">IP Address</Label>
									<Input
										id="cust-ip"
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
						<form.Field name="billingDay">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="cust-bday">
										Billing Day (1-28)
									</Label>
									<Input
										id="cust-bday"
										type="number"
										min={1}
										max={28}
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
									/>
								</div>
							)}
						</form.Field>
					</div>

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

					<DialogFooter>
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
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
