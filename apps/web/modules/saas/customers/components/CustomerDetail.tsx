"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useDeleteCustomer,
	useGenerateCustomerPin,
	useResetCustomerPin,
	useSetCustomerPin,
	useUpdateCustomer,
} from "../hooks/use-customers";
import { usePlansQuery } from "../hooks/use-plans";
import { useStationsQuery } from "../hooks/use-stations";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_LABELS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";

export function CustomerDetail({
	customerId,
	organizationSlug,
}: {
	customerId: string;
	organizationSlug: string;
}) {
	const organizationId = useOrganizationId();
	const updateCustomer = useUpdateCustomer();
	const deleteCustomer = useDeleteCustomer();
	const generatePin = useGenerateCustomerPin();
	const resetPin = useResetCustomerPin();
	const setPin = useSetCustomerPin();
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const [generatedPin, setGeneratedPin] = useState<string | null>(null);
	const [showSetPin, setShowSetPin] = useState(false);
	const [manualPin, setManualPin] = useState("");

	const { data } = useSuspenseQuery(
		orpc.customers.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				id: customerId,
			},
		}),
	);

	const customer = data.customer;

	const form = useForm({
		defaultValues: {
			fullName: customer.fullName,
			email: customer.email ?? "",
			phone: customer.phone ?? "",
			address: customer.address ?? "",
			username: customer.username ?? "",
			planId: customer.planId ?? "",
			stationId: customer.stationId ?? "",
			status: customer.status,
			connectionType: customer.connectionType ?? "",
			ipAddress: customer.ipAddress ?? "",
			macAddress: customer.macAddress ?? "",
			monthlyRate: customer.monthlyRate?.toString() ?? "",
			billingDay: customer.billingDay?.toString() ?? "",
			balance: customer.balance.toString(),
			notes: customer.notes ?? "",
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				updateCustomer.mutateAsync({
					organizationId,
					id: customerId,
					fullName: value.fullName,
					email: value.email || undefined,
					phone: value.phone || undefined,
					address: value.address || undefined,
					username: value.username || undefined,
					planId: value.planId || null,
					stationId: value.stationId || null,
					status: value.status as
						| "ACTIVE"
						| "INACTIVE"
						| "SUSPENDED"
						| "PENDING",
					connectionType: (value.connectionType || null) as
						| "FIBER"
						| "WIRELESS"
						| "DSL"
						| "CABLE"
						| "ETHERNET"
						| null,
					ipAddress: value.ipAddress || undefined,
					macAddress: value.macAddress || undefined,
					monthlyRate: value.monthlyRate
						? Number(value.monthlyRate)
						: null,
					billingDay: value.billingDay
						? Number(value.billingDay)
						: null,
					balance: Number(value.balance),
					notes: value.notes || undefined,
				}),
				{
					loading: "Saving changes...",
					success: "Customer updated successfully",
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to save changes",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	function handleSetPin() {
		if (!organizationId || !/^\d{6}$/.test(manualPin)) {
			return;
		}
		toast.promise(
			setPin.mutateAsync({
				organizationId,
				customerId,
				pin: manualPin,
			}),
			{
				loading: "Setting PIN...",
				success: () => {
					setShowSetPin(false);
					setManualPin("");
					return "PIN set successfully";
				},
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to set PIN",
			},
		);
	}

	return (
		<div>
			<div className="mb-6">
				<Button variant="ghost" size="sm" className="mb-4" asChild>
					<Link
						to="/app/$organizationSlug/customers"
						params={{ organizationSlug }}
					>
						<ArrowLeftIcon className="mr-2 size-4" />
						Back to Customers
					</Link>
				</Button>
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">
							{customer.fullName}
						</h1>
						<div className="flex items-center gap-3 text-muted-foreground">
							<span className="font-mono text-sm">
								{customer.accountNumber}
							</span>
							<Badge>
								{CUSTOMER_STATUS_LABELS[customer.status] ??
									customer.status}
							</Badge>
						</div>
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
							<form.Field name="fullName">
								{(field) => (
									<div className="space-y-2">
										<Label>Full Name</Label>
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
							<form.Field name="address">
								{(field) => (
									<div className="space-y-2">
										<Label>Address</Label>
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
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Service Configuration
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="planId">
									{(field) => (
										<div className="space-y-2">
											<Label>Plan</Label>
											<Select
												value={field.state.value}
												onValueChange={
													field.handleChange
												}
											>
												<SelectTrigger>
													<SelectValue placeholder="No plan" />
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
												onValueChange={
													field.handleChange
												}
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
							</div>
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
													{CUSTOMER_STATUS_OPTIONS.map(
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
								<form.Field name="connectionType">
									{(field) => (
										<div className="space-y-2">
											<Label>Connection Type</Label>
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
													{CONNECTION_TYPE_OPTIONS.map(
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
								<form.Field name="username">
									{(field) => (
										<div className="space-y-2">
											<Label>PPPoE Username</Label>
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
								<form.Field name="ipAddress">
									{(field) => (
										<div className="space-y-2">
											<Label>IP Address</Label>
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
							<CardTitle className="text-base">Billing</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-3 gap-4">
								<form.Field name="monthlyRate">
									{(field) => (
										<div className="space-y-2">
											<Label>Monthly Rate ($)</Label>
											<Input
												type="number"
												min={0}
												step="0.01"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(
														e.target.value,
													)
												}
												placeholder="Plan price"
											/>
										</div>
									)}
								</form.Field>
								<form.Field name="billingDay">
									{(field) => (
										<div className="space-y-2">
											<Label>Billing Day</Label>
											<Input
												type="number"
												min={1}
												max={28}
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
								<form.Field name="balance">
									{(field) => (
										<div className="space-y-2">
											<Label>Balance ($)</Label>
											<Input
												type="number"
												step="0.01"
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

				<Card className="mt-6">
					<CardHeader>
						<CardTitle className="text-base">Security</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1">
								<p className="text-sm font-medium">
									Customer PIN
								</p>
								<p className="text-sm text-muted-foreground">
									{customer.hasPin
										? "PIN is set. Customer can verify identity via AI agents."
										: "No PIN set. Customer cannot verify identity via AI agents."}
								</p>
								{customer.hasPin && (
									<p className="font-mono text-2xl tracking-widest pt-1">
										{customer.pin ?? (
											<span className="text-sm text-muted-foreground font-sans tracking-normal">
												PIN was set before display was
												enabled. Re-generate to see it.
											</span>
										)}
									</p>
								)}
							</div>
							<div className="flex items-center gap-2">
								<Badge
									variant={
										customer.hasPin
											? "default"
											: "secondary"
									}
								>
									{customer.hasPin ? "PIN Active" : "No PIN"}
								</Badge>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setShowSetPin(true)}
								>
									Set PIN
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={generatePin.isPending}
									onClick={() => {
										if (!organizationId) {
											return;
										}
										generatePin.mutate(
											{
												organizationId,
												customerId,
											},
											{
												onSuccess: (data) => {
													setGeneratedPin(data.pin);
												},
											},
										);
									}}
								>
									{generatePin.isPending
										? "Generating..."
										: "Generate Random PIN"}
								</Button>
								{customer.hasPin && (
									<AlertDialog>
										<AlertDialogTrigger asChild>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={resetPin.isPending}
											>
												Reset PIN
											</Button>
										</AlertDialogTrigger>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>
													Reset Customer PIN
												</AlertDialogTitle>
												<AlertDialogDescription>
													This will remove the
													customer's PIN. They will no
													longer be able to verify
													their identity via AI agents
													until a new PIN is
													generated.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel>
													Cancel
												</AlertDialogCancel>
												<AlertDialogAction
													onClick={() => {
														if (!organizationId) {
															return;
														}
														resetPin.mutate(
															{
																organizationId,
																customerId,
															},
															{
																onSuccess:
																	() => {
																		toast.success(
																			"PIN has been reset",
																		);
																	},
															},
														);
													}}
												>
													Reset PIN
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Set PIN Dialog */}
				<Dialog open={showSetPin} onOpenChange={setShowSetPin}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Set Customer PIN</DialogTitle>
							<DialogDescription>
								Enter a 6-digit PIN for the customer. They will
								use this to verify their identity with AI
								agents.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="manual-pin">6-Digit PIN</Label>
								<Input
									id="manual-pin"
									value={manualPin}
									onChange={(e) => {
										const val = e.target.value.replace(
											/\D/g,
											"",
										);
										if (val.length <= 6) {
											setManualPin(val);
										}
									}}
									placeholder="000000"
									maxLength={6}
									className="font-mono text-center text-lg tracking-widest"
								/>
								{manualPin.length > 0 &&
									manualPin.length < 6 && (
										<p className="text-sm text-muted-foreground">
											{6 - manualPin.length} more digits
											needed
										</p>
									)}
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setShowSetPin(false);
									setManualPin("");
								}}
							>
								Cancel
							</Button>
							<Button
								type="button"
								disabled={
									!/^\d{6}$/.test(manualPin) ||
									setPin.isPending
								}
								onClick={handleSetPin}
							>
								{setPin.isPending
									? "Setting PIN..."
									: "Set PIN"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Generated PIN Display Dialog */}
				<Dialog
					open={generatedPin !== null}
					onOpenChange={(open) => {
						if (!open) {
							setGeneratedPin(null);
						}
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Customer PIN Generated</DialogTitle>
							<DialogDescription>
								Share this PIN with the customer. It will only
								be shown once.
							</DialogDescription>
						</DialogHeader>
						<div className="flex items-center justify-center py-6">
							<span className="font-mono text-4xl tracking-widest">
								{generatedPin}
							</span>
						</div>
						<p className="text-center text-sm text-muted-foreground">
							The customer can use this PIN to verify their
							identity when interacting with AI agents.
						</p>
					</DialogContent>
				</Dialog>

				<div className="mt-6 flex items-center justify-between">
					<Button
						type="button"
						variant="destructive"
						onClick={() => {
							if (
								organizationId &&
								confirm(
									"Deactivate this customer? They will be set to Inactive.",
								)
							) {
								deleteCustomer.mutate(
									{
										organizationId,
										id: customerId,
									},
									{
										onSuccess: () => {
											toast.success(
												"Customer deactivated",
											);
										},
									},
								);
							}
						}}
					>
						Deactivate Customer
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			</form>
		</div>
	);
}
