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
import {
	ActivityIcon,
	DollarSignIcon,
	FileTextIcon,
	NetworkIcon,
	ServerIcon,
	UserIcon,
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
	return {
		firstName: customer.firstName ?? "",
		lastName: customer.lastName ?? "",
		email: customer.email ?? "",
		phone: customer.phone ?? "",
		mobile: customer.mobile ?? "",
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
		collectorId: customer.collectorId ?? "",
	};
}

type CustomerFormValues = ReturnType<typeof getCustomerFormDefaults>;

// TanStack Form's ReactFormExtendedApi requires all validator type params to be specified
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

interface ActivityTabProps {
	customer: CustomerData;
	customerId: string;
	organizationId: string | null;
	generatedPin: string | null;
	setGeneratedPin: (pin: string | null) => void;
	showSetPin: boolean;
	setShowSetPin: (show: boolean) => void;
	manualPin: string;
	setManualPin: (pin: string) => void;
	handleSetPin: () => void;
	generatePin: ReturnType<typeof useGenerateCustomerPin>;
	resetPin: ReturnType<typeof useResetCustomerPin>;
}

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
	const { employees } = useEmployeesQuery();
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
				<span className="flex items-center gap-3">
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
									organizationId={organizationId}
									generatedPin={generatedPin}
									setGeneratedPin={setGeneratedPin}
									showSetPin={showSetPin}
									setShowSetPin={setShowSetPin}
									manualPin={manualPin}
									setManualPin={setManualPin}
									handleSetPin={handleSetPin}
									generatePin={generatePin}
									resetPin={resetPin}
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
		<>
			<DetailSection title="Personal Information">
				<FieldGroup columns={2}>
					<form.Field name="firstName">
						{(field) => (
							<div className="space-y-2">
								<Label>First Name</Label>
								<Input
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="lastName">
						{(field) => (
							<div className="space-y-2">
								<Label>Last Name</Label>
								<Input
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label>Email</Label>
								<Input
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
								<Label>Phone</Label>
								<Input
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="mobile">
						{(field) => (
							<div className="space-y-2">
								<Label>Mobile</Label>
								<Input
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
					<form.Field name="address">
						{(field) => (
							<div className="space-y-2">
								<Label>Address</Label>
								<Input
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
				</FieldGroup>
			</DetailSection>

			<DetailSection title="Service & Connection">
				<FieldGroup columns={3}>
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
											<SelectItem key={p.id} value={p.id}>
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
											<SelectItem key={s.id} value={s.id}>
												{s.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</form.Field>
					<form.Field name="collectorId">
						{(field) => (
							<div className="space-y-2">
								<Label>Collector</Label>
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
											<SelectItem key={e.id} value={e.id}>
												{e.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</form.Field>
					{customer.accessPoint && (
						<ReadOnlyField
							label="Access Point"
							value={customer.accessPoint.name}
						/>
					)}
					<form.Field name="status">
						{(field) => (
							<div className="space-y-2">
								<Label>Status</Label>
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
							</div>
						)}
					</form.Field>
					<form.Field name="connectionType">
						{(field) => (
							<div className="space-y-2">
								<Label>Connection Type</Label>
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
										{CONNECTION_TYPE_OPTIONS.map((opt) => (
											<SelectItem
												key={opt.value}
												value={opt.value}
											>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</form.Field>
					<form.Field name="username">
						{(field) => (
							<div className="space-y-2">
								<Label>PPPoE Username</Label>
								<Input
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
				</FieldGroup>
			</DetailSection>

			<DetailSection title="Notes">
				<form.Field name="notes">
					{(field) => (
						<Textarea
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							rows={3}
							placeholder="Add notes about this customer..."
						/>
					)}
				</form.Field>
			</DetailSection>
		</>
	);
}

function NetworkTab({ customer }: { customer: CustomerData }) {
	return (
		<>
			<DetailSection title="Connection Details">
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

			<DetailSection title="Status Flags">
				<div className="flex flex-wrap gap-4">
					<StatusIndicator
						status={customer.online ? "online" : "offline"}
						variant="badge"
					/>
				</div>
				<PropertyList
					columns={4}
					items={[
						{ label: "FUP Mode", value: customer.fupMode },
						{ label: "Auto Renew", value: customer.automaticRenew },
						{ label: "Simultaneous", value: customer.simultaneous },
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

			<DetailSection title="Override Settings">
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
			<DetailSection title="Billing">
				<FieldGroup columns={3}>
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
								<Label>Billing Day (1-28)</Label>
								<Input
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
					<form.Field name="balance">
						{(field) => (
							<div className="space-y-2">
								<Label>Balance ($)</Label>
								<Input
									type="number"
									step="0.01"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
				</FieldGroup>
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
			</DetailSection>

			<DetailSection title="Monthly Usage">
				<FieldGroup columns={4}>
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

			<DetailSection title="Free Usage Quotas">
				<FieldGroup columns={4}>
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
	organizationId,
	generatedPin,
	setGeneratedPin,
	showSetPin,
	setShowSetPin,
	manualPin,
	setManualPin,
	handleSetPin,
	generatePin,
	resetPin,
}: ActivityTabProps) {
	return (
		<>
			{(customer.latitude || customer.longitude) && (
				<DetailSection title="Location">
					<PropertyList
						columns={2}
						items={[
							{ label: "Latitude", value: customer.latitude },
							{ label: "Longitude", value: customer.longitude },
						]}
					/>
				</DetailSection>
			)}

			<DetailSection title="Security — Account PIN">
				<div className="space-y-3">
					<p className="text-sm text-muted-foreground">
						{customer.pin
							? `PIN is set: ${customer.pin}`
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
			<DetailSection title="iRadius Metadata">
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
