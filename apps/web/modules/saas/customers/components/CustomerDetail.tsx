"use client";

import { DetailPanel, DetailSection } from "@shared/components/DetailPanel";
import { FieldGroup, ReadOnlyField } from "@shared/components/FieldGroup";
import { MetricDisplay } from "@shared/components/MetricDisplay";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import type {
	FormAsyncValidateOrFn,
	FormValidateOrFn,
	ReactFormExtendedApi,
} from "@tanstack/react-form";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { PhoneInput } from "@ui/components/phone-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Separator } from "@ui/components/separator";
import { Textarea } from "@ui/components/textarea";
import {
	ActivityIcon,
	DollarSignIcon,
	FileTextIcon,
	MapPinIcon,
	NavigationIcon,
	NetworkIcon,
	PlusIcon,
	ServerIcon,
	UserIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useEmployeesQuery } from "../../employees/hooks/use-employees";
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
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";
import { CustomerInvoices } from "./CustomerInvoices";
import { CustomerTransactions } from "./CustomerTransactions";

// ─── Type Definitions ──────────────────────────────────────────────────

type CustomerData = Awaited<
	ReturnType<typeof orpcClient.customers.get>
>["customer"];

type PlanItem = Awaited<
	ReturnType<typeof orpcClient.servicePlans.list>
>["plans"][number];

type StationItem = Awaited<
	ReturnType<typeof orpcClient.stations.list>
>["stations"][number];

type EmployeeItem = Awaited<
	ReturnType<typeof orpcClient.employees.list>
>["employees"][number];

function getCustomerFormDefaults(customer: CustomerData) {
	const phones = Array.isArray(customer.phones)
		? (customer.phones as Array<{ number: string; primary: boolean }>)
		: [];

	return {
		firstName: customer.firstName ?? "",
		lastName: customer.lastName ?? "",
		email: customer.email ?? "",
		phones: phones.length > 0 ? phones : [{ number: "", primary: true }],
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
		groupName: customer.groupName ?? "",
		notes: customer.notes ?? "",
		collectorId: customer.collectorId ?? "",
	};
}

type CustomerFormValues = ReturnType<typeof getCustomerFormDefaults>;

type CustomerForm = ReactFormExtendedApi<
	CustomerFormValues,
	undefined | FormValidateOrFn<CustomerFormValues>,
	undefined | FormValidateOrFn<CustomerFormValues>,
	undefined | FormAsyncValidateOrFn<CustomerFormValues>,
	undefined | FormValidateOrFn<CustomerFormValues>,
	undefined | FormAsyncValidateOrFn<CustomerFormValues>,
	undefined | FormValidateOrFn<CustomerFormValues>,
	undefined | FormAsyncValidateOrFn<CustomerFormValues>,
	undefined | FormValidateOrFn<CustomerFormValues>,
	undefined | FormAsyncValidateOrFn<CustomerFormValues>,
	undefined | FormAsyncValidateOrFn<CustomerFormValues>,
	unknown
>;

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
	const { plans } = usePlansQuery();
	const { stations } = useStationsQuery();
	const { employees } = useEmployeesQuery();

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
		defaultValues: getCustomerFormDefaults(customer),
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				updateCustomer.mutateAsync({
					organizationId,
					id: customerId,
					firstName: value.firstName,
					lastName: value.lastName || undefined,
					email: value.email || undefined,
					phones: value.phones.filter((p) => p.number.trim() !== ""),
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
					groupName: value.groupName || null,
					notes: value.notes || undefined,
					collectorId: value.collectorId || null,
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

	const statusType =
		customer.status === "ACTIVE"
			? "active"
			: customer.status === "SUSPENDED"
				? "suspended"
				: customer.status === "PENDING"
					? "pending"
					: "inactive";

	return (
		<PageShell
			title={displayName(customer.firstName, customer.lastName)}
			backTo={`/app/${organizationSlug}/customers`}
			backLabel="Customers"
			subtitle={
				<span className="flex flex-wrap items-center gap-2 sm:gap-3">
					<span className="font-mono">{customer.accountNumber}</span>
					<StatusIndicator status={statusType} variant="badge" />
					{customer.online && (
						<StatusIndicator status="online" variant="badge" />
					)}
					{customer.externalId && (
						<Badge variant="outline">
							iRadius: {customer.externalId}
						</Badge>
					)}
				</span>
			}
			actions={
				<div className="flex gap-2">
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" size="sm">
								Deactivate
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Deactivate Customer
								</AlertDialogTitle>
								<AlertDialogDescription>
									This will set the customer status to
									inactive.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => {
										if (!organizationId) {
											return;
										}
										deleteCustomer.mutate({
											organizationId,
											id: customerId,
										});
									}}
								>
									Deactivate
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<Button
						size="sm"
						disabled={isSubmitting}
						onClick={() => form.handleSubmit()}
					>
						{isSubmitting ? "Saving..." : "Save Changes"}
					</Button>
				</div>
			}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<DetailPanel
					tabs={[
						{
							id: "overview",
							label: "Overview",
							icon: UserIcon,
							content: (
								<OverviewTab
									form={form}
									customer={customer}
									plans={plans}
									stations={stations}
									employees={employees}
								/>
							),
						},
						{
							id: "network",
							label: "Network",
							icon: NetworkIcon,
							content: <NetworkTab customer={customer} />,
						},
						{
							id: "billing",
							label: "Usage & Billing",
							icon: DollarSignIcon,
							content: (
								<BillingTab form={form} customer={customer} />
							),
						},
						{
							id: "financial",
							label: "Financial",
							icon: FileTextIcon,
							content: <FinancialTab customerId={customerId} />,
						},
						{
							id: "activity",
							label: "Activity",
							icon: ActivityIcon,
							content: (
								<ActivityTab
									customer={customer}
									customerId={customerId}
								/>
							),
						},
						{
							id: "sync",
							label: "Sync Details",
							icon: ServerIcon,
							hidden: !customer.externalId,
							content: <SyncTab customer={customer} />,
						},
					]}
				/>
			</form>
		</PageShell>
	);
}

// ─── Phone Field Group ────────────────────────────────────────────────

const MAX_PHONES = 5;

function PhoneFieldGroup({ form }: { form: CustomerForm }) {
	const phones = useStore(form.store, (s) => s.values.phones);

	function updatePhone(index: number, number: string) {
		const updated = phones.map((p, i) =>
			i === index ? { ...p, number } : p,
		);
		form.setFieldValue("phones", updated);
	}

	function addPhone() {
		if (phones.length < MAX_PHONES) {
			form.setFieldValue("phones", [
				...phones,
				{ number: "", primary: false },
			]);
		}
	}

	function removePhone(index: number) {
		if (phones.length <= 1) {
			return;
		}
		const updated = phones.filter((_, i) => i !== index);
		const first = updated[0];
		if (phones[index]?.primary && first) {
			updated[0] = { ...first, primary: true };
		}
		form.setFieldValue("phones", updated);
	}

	function setPrimary(index: number) {
		const updated = phones.map((p, i) => ({
			...p,
			primary: i === index,
		}));
		form.setFieldValue("phones", updated);
	}

	return (
		<div className="space-y-2">
			<FieldLabel>Phone Numbers</FieldLabel>
			<div className="space-y-2">
				{phones.map((phone, index) => (
					<div key={index} className="flex items-center gap-1.5">
						<PhoneInput
							value={phone.number}
							onChange={(val) => updatePhone(index, val)}
							className="flex-1 min-w-0"
						/>
						<Button
							type="button"
							variant={phone.primary ? "primary" : "outline"}
							size="sm"
							className="shrink-0 h-9 text-xs px-2"
							title={
								phone.primary
									? "Primary number"
									: "Set as primary"
							}
							onClick={() => setPrimary(index)}
						>
							{phone.primary ? "Primary" : "Set primary"}
						</Button>
						{phones.length > 1 && (
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="shrink-0 size-9 text-destructive border-destructive/30 hover:bg-destructive/10"
								onClick={() => removePhone(index)}
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
						onClick={addPhone}
					>
						<PlusIcon className="size-3.5 mr-1" />
						Add phone
					</Button>
				)}
			</div>
		</div>
	);
}

// ─── Tab Content Components ────────────────────────────────────────────

function OverviewTab({
	form,
	customer,
	plans,
	stations,
	employees,
}: {
	form: CustomerForm;
	customer: CustomerData;
	plans: PlanItem[];
	stations: StationItem[];
	employees: EmployeeItem[];
}) {
	return (
		<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
			{/* Left column: Personal info — takes 2/3 on large screens */}
			<div className="lg:col-span-2 space-y-6">
				<DetailSection
					title="Personal Information"
					description="Customer identity and contact details"
				>
					<FieldGroup columns={2}>
						<form.Field name="firstName">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="firstName">
										First Name
									</FieldLabel>
									<Input
										id="firstName"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="First name"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="lastName">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="lastName">
										Last Name
									</FieldLabel>
									<Input
										id="lastName"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Last name"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="email">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="email">
										Email
									</FieldLabel>
									<Input
										id="email"
										type="email"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="customer@example.com"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="address">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="address">
										Address
									</FieldLabel>
									<Input
										id="address"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="Street address"
									/>
								</Field>
							)}
						</form.Field>
					</FieldGroup>

					<Separator />

					<PhoneFieldGroup form={form} />
				</DetailSection>

				<DetailSection
					title="Service & Connection"
					description="Plan, station, and network configuration"
				>
					<FieldGroup columns={3}>
						<form.Field name="planId">
							{(field) => (
								<Field>
									<FieldLabel>Plan</FieldLabel>
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
								</Field>
							)}
						</form.Field>
						<form.Field name="stationId">
							{(field) => (
								<Field>
									<FieldLabel>Station</FieldLabel>
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
								</Field>
							)}
						</form.Field>
						<form.Field name="collectorId">
							{(field) => (
								<Field>
									<FieldLabel>Collector</FieldLabel>
									<Select
										value={field.state.value || "none"}
										onValueChange={(v) =>
											field.handleChange(
												v === "none" ? "" : v,
											)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select collector" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">
												<span className="text-muted-foreground">
													None
												</span>
											</SelectItem>
											{employees.map((e) => (
												<SelectItem
													key={e.id}
													value={e.id}
												>
													{e.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						</form.Field>
						<form.Field name="connectionType">
							{(field) => (
								<Field>
									<FieldLabel>Connection Type</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(
												value as typeof field.state.value,
											)
										}
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
								</Field>
							)}
						</form.Field>
						<form.Field name="username">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="username">
										PPPoE Username
									</FieldLabel>
									<Input
										id="username"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="PPPoE username"
									/>
								</Field>
							)}
						</form.Field>
						<form.Field name="groupName">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="groupName">
										Group
									</FieldLabel>
									<Input
										id="groupName"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="e.g. Residential, Business"
									/>
								</Field>
							)}
						</form.Field>
						{customer.accessPoint && (
							<ReadOnlyField
								label="Access Point"
								value={customer.accessPoint.name}
							/>
						)}
					</FieldGroup>
				</DetailSection>
			</div>

			{/* Right column: Status & Notes — takes 1/3 on large screens */}
			<div className="space-y-6">
				<DetailSection title="Status">
					<form.Field name="status">
						{(field) => (
							<Field>
								<FieldLabel>Account Status</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={(value) =>
										field.handleChange(
											value as typeof field.state.value,
										)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CUSTOMER_STATUS_OPTIONS.map((opt) => (
											<SelectItem
												key={opt.value}
												value={opt.value}
											>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
				</DetailSection>

				<DetailSection title="Notes">
					<form.Field name="notes">
						{(field) => (
							<Textarea
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value)
								}
								rows={5}
								placeholder="Add notes about this customer..."
							/>
						)}
					</form.Field>
				</DetailSection>
			</div>
		</div>
	);
}

function NetworkTab({ customer }: { customer: CustomerData }) {
	return (
		<>
			<DetailSection
				title="Connection Details"
				description="IP, MAC, and NAS configuration"
			>
				<PropertyList
					columns={3}
					items={[
						{
							label: "IP Address",
							value: customer.ipAddress,
							mono: true,
							copyable: true,
						},
						{
							label: "Static IP",
							value: customer.staticIp,
							mono: true,
							copyable: true,
						},
						{
							label: "MAC Address",
							value: customer.macAddress,
							mono: true,
							copyable: true,
						},
						{
							label: "NAS Host",
							value: customer.nasHost,
							mono: true,
							copyable: true,
						},
						{
							label: "MikroTik User",
							value: customer.mikrotikUser,
							mono: true,
						},
						{
							label: "MikroTik Interface",
							value: customer.mikrotikInterface,
						},
						{
							label: "MikroTik Interface 2",
							value: customer.mikrotikInterface1,
						},
						{
							label: "MikroTik Queue",
							value: customer.mikrotikQueue,
						},
						{
							label: "Wireless Interface",
							value: customer.wirelessInterface,
						},
						{
							label: "Router Brand Prefix",
							value: customer.routerBrandPrefix,
							mono: true,
						},
					]}
				/>
			</DetailSection>

			<DetailSection
				title="Status Flags"
				description="Current feature toggles and account flags"
			>
				<div className="flex flex-wrap gap-4 mb-3">
					<StatusIndicator
						status={customer.online ? "online" : "offline"}
						variant="badge"
					/>
				</div>
				<PropertyList
					columns={4}
					items={[
						{ label: "FUP Mode", value: customer.fupMode },
						{
							label: "Auto Renew",
							value: customer.automaticRenew,
						},
						{
							label: "Simultaneous",
							value: customer.simultaneous,
						},
						{
							label: "AP Electrical",
							value: customer.apElectrical,
						},
						{ label: "Temp User", value: customer.tempUser },
						{ label: "Read Only", value: customer.readOnly },
						{
							label: "Reach Max Quota",
							value: customer.reachMaxQuota,
						},
						{
							label: "Show Traffic",
							value: customer.canShowTrafficDetails,
						},
					]}
				/>
			</DetailSection>

			<DetailSection
				title="Override Settings"
				description="Account-level overrides for recharge and expiry"
			>
				<PropertyList
					columns={3}
					items={[
						{
							label: "Force Override Recharge",
							value: customer.forceOverrideImmediateRecharge,
						},
						{
							label: "Override Recharge",
							value: customer.overrideImmediateRecharge,
						},
						{
							label: "Force Auto Bind MAC",
							value: customer.forceAutoBindAccToMac,
						},
						{
							label: "Override Auto Bind MAC",
							value: customer.overrideAutoBindAccToMac,
						},
						{
							label: "Force Expiry Days",
							value: customer.forceExpiryAfterDays,
						},
						{
							label: "Override Expiry",
							value: customer.overrideExpiryAccount
								? new Date(
										customer.overrideExpiryAccount,
									).toLocaleDateString()
								: null,
						},
						{
							label: "Temp Expiry",
							value: customer.tempExpiryAccount
								? new Date(
										customer.tempExpiryAccount,
									).toLocaleDateString()
								: null,
						},
					]}
				/>
			</DetailSection>

			<DetailSection title="Reference IDs">
				<PropertyList
					columns={4}
					items={[
						{
							label: "NAS Account ID",
							value: customer.nasAccountId,
						},
						{
							label: "Old Account Type",
							value: customer.oldAccountTypeId,
						},
						{
							label: "Forward Account Type",
							value: customer.forwardAccountTypeId,
						},
						{
							label: "Condition Account Type",
							value: customer.conditionAccountTypeId,
						},
						{ label: "Link ID", value: customer.linkId },
						{
							label: "Financial Category",
							value: customer.financialCategoryId,
						},
					]}
				/>
			</DetailSection>
		</>
	);
}

function BillingTab({
	form,
	customer,
}: {
	form: CustomerForm;
	customer: CustomerData;
}) {
	return (
		<>
			<DetailSection
				title="Billing"
				description="Monthly rate, billing cycle, and balance"
			>
				<FieldGroup columns={3}>
					<form.Field name="monthlyRate">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="monthlyRate">
									Monthly Rate ($)
								</FieldLabel>
								<Input
									id="monthlyRate"
									type="number"
									min={0}
									step="0.01"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									placeholder="Use plan price"
								/>
								<FieldDescription>
									Leave empty to use plan default
								</FieldDescription>
							</Field>
						)}
					</form.Field>
					<form.Field name="billingDay">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="billingDay">
									Billing Day
								</FieldLabel>
								<Input
									id="billingDay"
									type="number"
									min={1}
									max={28}
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									placeholder="1–28"
								/>
								<FieldDescription>
									Day of month (1–28)
								</FieldDescription>
							</Field>
						)}
					</form.Field>
					<form.Field name="balance">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="balance">
									Balance ($)
								</FieldLabel>
								<Input
									id="balance"
									type="number"
									step="0.01"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</Field>
						)}
					</form.Field>
				</FieldGroup>

				{(customer.discount > 0 ||
					customer.iptvPrice > 0 ||
					customer.realIpPrice > 0 ||
					customer.deductMoney) && (
					<>
						<Separator />
						<FieldGroup columns={4}>
							<ReadOnlyField
								label="Discount"
								value={
									customer.discount > 0
										? formatCurrency(customer.discount)
										: null
								}
							/>
							<ReadOnlyField
								label="IPTV Price"
								value={
									customer.iptvPrice > 0
										? formatCurrency(customer.iptvPrice)
										: null
								}
							/>
							<ReadOnlyField
								label="Real IP Price"
								value={
									customer.realIpPrice > 0
										? formatCurrency(customer.realIpPrice)
										: null
								}
							/>
							<ReadOnlyField
								label="Deduct Money"
								value={customer.deductMoney}
							/>
						</FieldGroup>
					</>
				)}
			</DetailSection>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<DetailSection
					title="Monthly Usage"
					description="Current period bandwidth consumption"
				>
					<FieldGroup columns={2}>
						<MetricDisplay
							label="Download"
							value={customer.downloadBytes ?? 0}
							format="bytes"
						/>
						<MetricDisplay
							label="Upload"
							value={customer.uploadBytes ?? 0}
							format="bytes"
						/>
						<MetricDisplay
							label="Daily Download"
							value={customer.dailyDownloadBytes ?? 0}
							format="bytes"
						/>
						<MetricDisplay
							label="Daily Upload"
							value={customer.dailyUploadBytes ?? 0}
							format="bytes"
						/>
					</FieldGroup>
				</DetailSection>

				<DetailSection
					title="Free Usage Quotas"
					description="Included allowances before metering"
				>
					<FieldGroup columns={2}>
						<MetricDisplay
							label="Free Download"
							value={customer.freeDownloadBytes ?? 0}
							format="bytes"
						/>
						<MetricDisplay
							label="Free Upload"
							value={customer.freeUploadBytes ?? 0}
							format="bytes"
						/>
						<MetricDisplay
							label="Free Daily DL"
							value={customer.freeDailyDownloadBytes ?? 0}
							format="bytes"
						/>
						<MetricDisplay
							label="Free Daily UL"
							value={customer.freeDailyUploadBytes ?? 0}
							format="bytes"
						/>
					</FieldGroup>
				</DetailSection>
			</div>

			<DetailSection title="Extra Quotas">
				<PropertyList
					columns={3}
					items={[
						{
							label: "Extra Upload GB",
							value: customer.extraUploadGb,
						},
						{
							label: "Extra Download GB",
							value: customer.extraDownloadGb,
						},
						{
							label: "Extra Days on Refill",
							value: customer.extraDaysToAddOnRefill,
						},
						{
							label: "Deduct Days on Refill",
							value: customer.extraDaysToDeductOnRefill,
						},
						{ label: "Added Hours", value: customer.addedHours },
					]}
				/>
			</DetailSection>
		</>
	);
}

function FinancialTab({ customerId }: { customerId: string }) {
	return (
		<>
			<DetailSection title="Invoices">
				<CustomerInvoices customerId={customerId} />
			</DetailSection>
			<DetailSection title="Transactions">
				<CustomerTransactions customerId={customerId} />
			</DetailSection>
		</>
	);
}

function ActivityTab({
	customer,
	customerId,
}: {
	customer: CustomerData;
	customerId: string;
}) {
	const organizationId = useOrganizationId();
	const generatePin = useGenerateCustomerPin();
	const resetPin = useResetCustomerPin();
	const setPin = useSetCustomerPin();
	const [generatedPin, setGeneratedPin] = useState<string | null>(null);
	const [showSetPin, setShowSetPin] = useState(false);
	const [manualPin, setManualPin] = useState("");

	function handleSetPin() {
		if (!organizationId || !/^\d{6}$/.test(manualPin)) {
			return;
		}
		toast.promise(
			setPin.mutateAsync({ organizationId, customerId, pin: manualPin }),
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
		<>
			{customer.latitude && customer.longitude && (
				<DetailSection
					title="Location"
					description="GPS coordinates from last known location"
				>
					<div className="flex items-center gap-3">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
							<MapPinIcon className="size-4 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm tabular-nums text-muted-foreground">
								{customer.latitude.toFixed(6)},{" "}
								{customer.longitude.toFixed(6)}
							</p>
						</div>
						<Button variant="outline" size="sm" asChild>
							<a
								href={`https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}`}
								target="_blank"
								rel="noopener noreferrer"
							>
								<NavigationIcon className="mr-1.5 size-3.5" />
								Get Directions
							</a>
						</Button>
					</div>
				</DetailSection>
			)}

			<DetailSection
				title="Account PIN"
				description="6-digit PIN for customer self-service access"
			>
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						{customer.pin
							? `Current PIN: ${customer.pin}`
							: "No PIN configured"}
					</p>
					<div className="flex flex-wrap gap-2">
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
							onClick={() => {
								if (!organizationId) {
									return;
								}
								toast.promise(
									generatePin
										.mutateAsync({
											organizationId,
											customerId,
										})
										.then((res: { pin: string }) => {
											setGeneratedPin(res.pin);
											return res;
										}),
									{
										loading: "Generating...",
										success: "PIN generated",
										error: "Failed to generate PIN",
									},
								);
							}}
						>
							Generate Random
						</Button>
						{customer.pin && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									if (!organizationId) {
										return;
									}
									toast.promise(
										resetPin.mutateAsync({
											organizationId,
											customerId,
										}),
										{
											loading: "Resetting...",
											success: "PIN removed",
											error: "Failed to reset PIN",
										},
									);
								}}
							>
								Reset PIN
							</Button>
						)}
					</div>
					{generatedPin && (
						<p className="text-sm">
							Generated PIN:{" "}
							<span className="font-mono font-bold">
								{generatedPin}
							</span>
						</p>
					)}
				</div>
			</DetailSection>

			{/* Set PIN Dialog */}
			<Dialog open={showSetPin} onOpenChange={setShowSetPin}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Set Account PIN</DialogTitle>
						<DialogDescription>
							Enter a 6-digit PIN for this customer account.
						</DialogDescription>
					</DialogHeader>
					<Input
						placeholder="000000"
						maxLength={6}
						value={manualPin}
						onChange={(e) =>
							setManualPin(e.target.value.replace(/\D/g, ""))
						}
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowSetPin(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleSetPin}
							disabled={!/^\d{6}$/.test(manualPin)}
						>
							Set PIN
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function SyncTab({ customer }: { customer: CustomerData }) {
	return (
		<>
			<DetailSection
				title="iRadius Metadata"
				description="Synced data from the external iRadius system"
			>
				<PropertyList
					columns={3}
					items={[
						{
							label: "External ID",
							value: customer.externalId,
							mono: true,
						},
						{
							label: "Original Created",
							value: customer.originalCreatedAt
								? new Date(
										customer.originalCreatedAt,
									).toLocaleDateString()
								: null,
						},
						{
							label: "Activated",
							value: customer.activatedAt
								? new Date(
										customer.activatedAt,
									).toLocaleDateString()
								: null,
						},
						{
							label: "Expires",
							value: customer.expiresAt
								? new Date(
										customer.expiresAt,
									).toLocaleDateString()
								: null,
						},
						{
							label: "Last Login",
							value: customer.lastLogin
								? new Date(customer.lastLogin).toLocaleString()
								: null,
						},
						{
							label: "Last Log Out",
							value: customer.lastLogOut
								? new Date(customer.lastLogOut).toLocaleString()
								: null,
						},
						{
							label: "NAS Last Log Out",
							value: customer.nasLastLogOut
								? new Date(
										customer.nasLastLogOut,
									).toLocaleString()
								: null,
						},
						{ label: "MOF", value: customer.mof },
						{ label: "Category", value: customer.categoryName },
						{ label: "Group", value: customer.groupName },
						{ label: "Collector", value: customer.collectorName },
						{
							label: "Collector Phone",
							value: customer.collectorPhone,
						},
					]}
				/>
			</DetailSection>

			<DetailSection title="Collector Flags">
				<PropertyList
					columns={3}
					items={[
						{
							label: "Can Reset Account",
							value: customer.canResetAccount,
						},
						{
							label: "Collector Reset MAC",
							value: customer.collectorResetMac,
						},
						{
							label: "Collector Show Links",
							value: customer.collectorCanShowLinks,
						},
						{
							label: "Show Traffic Details",
							value: customer.canShowTrafficDetails,
						},
						{
							label: "Auto Generate Invoice",
							value: customer.autoGenerateInvoice,
						},
					]}
				/>
			</DetailSection>
		</>
	);
}
