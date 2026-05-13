"use client";

import { AsyncBoundary } from "@shared/components/AsyncBoundary";
import { DetailPanel, DetailSection } from "@shared/components/DetailPanel";
import { FieldGroup, ReadOnlyField } from "@shared/components/FieldGroup";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate, formatDateTime } from "@shared/lib/format";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
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
import { Skeleton } from "@ui/components/skeleton";
import { Textarea } from "@ui/components/textarea";
import {
	ActivityIcon,
	AlertCircleIcon,
	CheckCircle2Icon,
	MoreVerticalIcon,
	NetworkIcon,
	PlusIcon,
	UserIcon,
	UserXIcon,
	WalletIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useEmployeesQuery } from "../../employees/hooks/use-employees";
import {
	useDeleteCustomer,
	useExecuteAccountTypeChange,
	useGenerateCustomerPin,
	useIRadiusGroups,
	usePreviewAccountTypeChange,
	useResetCustomerPin,
	useSetCustomerPin,
	useUpdateCustomer,
} from "../hooks/use-customers";
import { usePlansQuery } from "../hooks/use-plans";
import {
	CONNECTION_TYPE_OPTIONS,
	CUSTOMER_STATUS_OPTIONS,
} from "../lib/constants";
import { CustomerActivityTimeline } from "./CustomerActivityTimeline";
import { CustomerInvoices } from "./CustomerInvoices";
import { CustomerIradiusMenu } from "./CustomerIradiusMenu";
import { CustomerLiveStrip } from "./CustomerLiveStrip";
import { CustomerLocationSection } from "./CustomerLocationSection";
import { CustomerPayments } from "./CustomerPayments";
import { CustomerSaveBar } from "./CustomerSaveBar";
import { CustomerTransactions } from "./CustomerTransactions";

// ─── Types ─────────────────────────────────────────────────────────────

type CustomerData = Awaited<
	ReturnType<typeof orpcClient.customers.get>
>["customer"];

type PlanItem = Awaited<
	ReturnType<typeof orpcClient.servicePlans.list>
>["plans"][number];

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
		planId: customer.planId ?? "",
		status: customer.status,
		connectionType: customer.connectionType ?? "",
		monthlyRate: customer.monthlyRate?.toString() ?? "",
		balance: customer.balance.toString(),
		groupName: customer.groupName ?? "",
		groupExternalId: customer.groupExternalId?.toString() ?? "",
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

// ─── Parent ────────────────────────────────────────────────────────────

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
	const previewAccountType = usePreviewAccountTypeChange();
	const executeAccountType = useExecuteAccountTypeChange();
	const [syncToIRadius, setSyncToIRadius] = useState(true);
	const [accountTypePreview, setAccountTypePreview] = useState<{
		previewData: Awaited<ReturnType<typeof previewAccountType.mutateAsync>>;
		newPlanId: string;
		pendingFormValues: CustomerFormValues;
	} | null>(null);
	const [changeResult, setChangeResult] = useState<{
		success: boolean;
		oldPlanName: string;
		newPlanName: string;
		disconnected?: boolean;
		error?: string;
	} | null>(null);
	const [confirmDeactivate, setConfirmDeactivate] = useState(false);
	const [confirmReactivate, setConfirmReactivate] = useState(false);

	const { plans } = usePlansQuery();
	const { employees } = useEmployeesQuery();
	const { groups: iradiusGroups } = useIRadiusGroups();

	const { data } = useSuspenseQuery(
		orpc.customers.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
				id: customerId,
			},
		}),
	);

	const customer = data.customer;
	const isLinked = !!customer.externalId;

	function buildUpdatePayload(values: CustomerFormValues) {
		const parsedGroupId = values.groupExternalId
			? Number.parseInt(values.groupExternalId, 10)
			: null;
		const resolvedGroupName = parsedGroupId
			? (iradiusGroups.find((g) => g.id === parsedGroupId)?.name ??
				values.groupName ??
				null)
			: values.groupName || null;
		return {
			organizationId: organizationId ?? "",
			id: customerId,
			firstName: values.firstName || undefined,
			lastName: values.lastName || undefined,
			email: values.email || undefined,
			phones: values.phones.filter((p) => p.number.trim() !== ""),
			address: values.address || undefined,
			status: values.status as
				| "ACTIVE"
				| "INACTIVE"
				| "SUSPENDED"
				| "PENDING",
			connectionType: (values.connectionType || null) as
				| "FIBER"
				| "WIRELESS"
				| "DSL"
				| "CABLE"
				| "ETHERNET"
				| null,
			monthlyRate: values.monthlyRate ? Number(values.monthlyRate) : null,
			balance: Number(values.balance),
			groupName: resolvedGroupName,
			groupExternalId: parsedGroupId,
			notes: values.notes || undefined,
			collectorId: values.collectorId || null,
		};
	}

	const form = useForm({
		defaultValues: getCustomerFormDefaults(customer),
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}

			const planChanged = value.planId !== (customer.planId ?? "");
			const newPlan = plans.find((p) => p.id === value.planId);
			const shouldPreview =
				planChanged && customer.externalId && newPlan?.externalId;

			if (shouldPreview) {
				try {
					const preview = await previewAccountType.mutateAsync({
						organizationId,
						customerId,
						newPlanId: value.planId,
					});
					setAccountTypePreview({
						previewData: preview,
						newPlanId: value.planId,
						pendingFormValues: { ...value },
					});
				} catch (err) {
					toast.error(
						`Failed to preview plan change: ${err instanceof Error ? err.message : "Unknown error"}`,
					);
				}
				return;
			}

			toast.promise(
				updateCustomer.mutateAsync({
					...buildUpdatePayload(value),
					planId: value.planId || null,
					syncToIRadius: isLinked ? syncToIRadius : undefined,
				}),
				{
					loading: "Saving changes…",
					success: () => {
						form.reset(value);
						return "Customer updated";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to save changes",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const dirtyCount = useStore(
		form.store,
		(s) =>
			Object.values(s.fieldMeta ?? {}).filter((m) => m?.isDirty).length,
	);

	async function handleConfirmAccountTypeChange() {
		if (!organizationId || !accountTypePreview) {
			return;
		}

		const { pendingFormValues, newPlanId, previewData } =
			accountTypePreview;

		let iRadiusResult: Awaited<
			ReturnType<typeof executeAccountType.mutateAsync>
		>;
		try {
			iRadiusResult = await executeAccountType.mutateAsync({
				organizationId,
				customerId,
				newPlanId,
			});
		} catch (err) {
			setChangeResult({
				success: false,
				oldPlanName: previewData.oldAccountType.name,
				newPlanName: previewData.newAccountType.name,
				error: err instanceof Error ? err.message : "Unknown error",
			});
			setAccountTypePreview(null);
			return;
		}

		setChangeResult({
			success: true,
			oldPlanName: previewData.oldAccountType.name,
			newPlanName: previewData.newAccountType.name,
			disconnected: iRadiusResult.disconnected,
		});
		setAccountTypePreview(null);

		try {
			await updateCustomer.mutateAsync({
				...buildUpdatePayload(pendingFormValues),
				syncToIRadius: isLinked ? syncToIRadius : undefined,
			});
			form.reset(pendingFormValues);
		} catch (err) {
			toast.error(
				`Plan changed, but other profile fields did not save: ${
					err instanceof Error ? err.message : "Unknown error"
				}`,
			);
		}
	}

	function handleCancelAccountTypeChange() {
		form.setFieldValue("planId", customer.planId ?? "");
		setAccountTypePreview(null);
	}

	// Two distinct badge axes that look similar without labels but mean
	// different things:
	//   - `statusType`  → subscription state (ACTIVE/INACTIVE/SUSPENDED/PENDING)
	//   - `networkType` → live device auth state at the NAS (online/offline)
	// Both are always rendered so the offline case is visible too.
	const statusType =
		customer.status === "ACTIVE"
			? "active"
			: customer.status === "SUSPENDED"
				? "suspended"
				: customer.status === "PENDING"
					? "pending"
					: "inactive";
	const statusLabel =
		statusType === "active"
			? "Active"
			: statusType === "inactive"
				? "Inactive"
				: statusType === "suspended"
					? "Suspended"
					: "Pending";
	const networkType = customer.online ? "online" : "offline";
	const networkLabel = customer.online ? "Online" : "Offline";

	return (
		<PageShell
			title={displayName(customer.firstName, customer.lastName)}
			backTo={`/app/${organizationSlug}/customers`}
			backLabel="Customers"
			subtitle={
				<span className="flex flex-wrap items-center gap-2 sm:gap-3">
					<span className="font-mono text-xs">
						{customer.accountNumber}
					</span>
					<StatusIndicator
						status={statusType}
						variant="badge"
						label={`Account: ${statusLabel}`}
					/>
					<StatusIndicator
						status={networkType}
						variant="badge"
						label={`Network: ${networkLabel}`}
					/>
					{customer.externalId && (
						<Badge
							variant="outline"
							className="font-mono text-[10px]"
						>
							iRadius #{customer.externalId}
						</Badge>
					)}
				</span>
			}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					{organizationId && (
						<CustomerIradiusMenu
							organizationId={organizationId}
							customer={{
								id: customer.id,
								externalId: customer.externalId ?? null,
								firstName: customer.firstName ?? null,
								lastName: customer.lastName ?? null,
								discount: customer.discount ?? null,
								iptvPrice: customer.iptvPrice ?? null,
								expiresAt: customer.expiresAt ?? null,
							}}
						/>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								<MoreVerticalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{customer.status === "ACTIVE" ? (
								<DropdownMenuItem
									onClick={() => setConfirmDeactivate(true)}
									className="text-destructive focus:text-destructive"
								>
									<UserXIcon className="mr-2 size-4" />
									Deactivate
								</DropdownMenuItem>
							) : (
								<DropdownMenuItem
									onClick={() => setConfirmReactivate(true)}
								>
									<CheckCircle2Icon className="mr-2 size-4" />
									Reactivate
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						size="sm"
						disabled={isSubmitting || dirtyCount === 0}
						onClick={() => form.handleSubmit()}
					>
						{isSubmitting ? "Saving…" : "Save changes"}
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
				className="space-y-6"
			>
				<CustomerLiveStrip
					online={customer.online ?? false}
					lastLogin={customer.lastLogin ?? null}
					plan={
						customer.plan
							? {
									name: customer.plan.name,
									downloadSpeed: customer.plan.downloadSpeed,
									uploadSpeed: customer.plan.uploadSpeed,
								}
							: null
					}
					expiresAt={customer.expiresAt ?? null}
					balance={customer.balance}
					monthlyRate={customer.monthlyRate ?? null}
					planMonthlyPrice={customer.plan?.monthlyPrice ?? null}
					dailyDownloadBytes={customer.dailyDownloadBytes ?? null}
					dailyUploadBytes={customer.dailyUploadBytes ?? null}
				/>

				<DetailPanel
					tabs={[
						{
							id: "profile",
							label: "Profile",
							icon: UserIcon,
							content: (
								<ProfileTab
									form={form}
									customer={customer}
									customerId={customerId}
								/>
							),
						},
						{
							id: "service",
							label: "Service",
							icon: WalletIcon,
							content: (
								<ServiceTab
									form={form}
									customer={customer}
									plans={plans}
									employees={employees}
									iradiusGroups={iradiusGroups}
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
							id: "activity",
							label: "Activity",
							icon: ActivityIcon,
							content: (
								<ActivityTab
									customerId={customerId}
									organizationSlug={organizationSlug}
								/>
							),
						},
					]}
				/>

				<CustomerSaveBar
					dirtyCount={dirtyCount}
					isSubmitting={isSubmitting}
					canMirrorIRadius={isLinked}
					syncToIRadius={syncToIRadius}
					onToggleSync={setSyncToIRadius}
					onDiscard={() => form.reset()}
					onSave={() => form.handleSubmit()}
				/>
			</form>

			{/* Plan change billing-impact preview */}
			<Dialog
				open={accountTypePreview !== null}
				onOpenChange={(open) => {
					if (!open) {
						handleCancelAccountTypeChange();
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Confirm plan change</DialogTitle>
						<DialogDescription>
							Review the billing impact before changing the plan
							in iRadius.
						</DialogDescription>
					</DialogHeader>

					{accountTypePreview && (
						<div className="space-y-4">
							<div className="rounded-lg border border-border p-3">
								<p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									Current plan
								</p>
								<p className="font-medium">
									{
										accountTypePreview.previewData
											.oldAccountType.name
									}
								</p>
								<div className="mt-1 flex gap-4 text-sm text-muted-foreground">
									<span>
										Rate:{" "}
										{formatCurrency(
											accountTypePreview.previewData
												.oldAccountType.rate,
										)}
									</span>
									<span>
										Price:{" "}
										{formatCurrency(
											accountTypePreview.previewData
												.oldAccountType.sellingPrice,
										)}
									</span>
								</div>
							</div>

							<div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
								<p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									New plan
								</p>
								<p className="font-medium">
									{
										accountTypePreview.previewData
											.newAccountType.name
									}
								</p>
								<div className="mt-1 flex gap-4 text-sm text-muted-foreground">
									<span>
										Rate:{" "}
										{formatCurrency(
											accountTypePreview.previewData
												.newAccountType.rate,
										)}
									</span>
									<span>
										Price:{" "}
										{formatCurrency(
											accountTypePreview.previewData
												.newAccountType.sellingPrice,
										)}
									</span>
								</div>
							</div>

							<div className="rounded-lg border border-border p-3">
								<p className="mb-2 text-sm font-medium">
									Billing impact
								</p>
								<div className="grid grid-cols-2 gap-2 text-sm">
									<span className="text-muted-foreground">
										Refund / charge:
									</span>
									<span
										className={
											accountTypePreview.previewData
												.billing.refund < 0
												? "text-destructive"
												: "text-success"
										}
									>
										{formatCurrency(
											accountTypePreview.previewData
												.billing.refund,
										)}
									</span>
									<span className="text-muted-foreground">
										Dealer credit before:
									</span>
									<span>
										{formatCurrency(
											accountTypePreview.previewData
												.billing.dealerCreditBefore,
										)}
									</span>
									<span className="text-muted-foreground">
										Dealer credit after:
									</span>
									<span>
										{formatCurrency(
											accountTypePreview.previewData
												.billing.dealerCreditAfter,
										)}
									</span>
									<span className="text-muted-foreground">
										Quota reset:
									</span>
									<span>
										{accountTypePreview.previewData.billing
											.quotaReset
											? "Yes"
											: "No"}
									</span>
								</div>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={handleCancelAccountTypeChange}
							disabled={executeAccountType.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleConfirmAccountTypeChange}
							disabled={executeAccountType.isPending}
						>
							{executeAccountType.isPending
								? "Changing…"
								: "Confirm change"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Plan change result */}
			<Dialog
				open={changeResult !== null}
				onOpenChange={(open) => {
					if (!open) {
						setChangeResult(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					{changeResult?.success ? (
						<>
							<DialogHeader>
								<div className="flex items-center gap-2">
									<CheckCircle2Icon className="size-5 text-success" />
									<DialogTitle>Plan changed</DialogTitle>
								</div>
								<DialogDescription>
									Updated in both iRadius and the local
									database.
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-2 text-sm">
								<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
									<span className="text-muted-foreground">
										Previous plan:
									</span>
									<span>{changeResult.oldPlanName}</span>
									<span className="text-muted-foreground">
										New plan:
									</span>
									<span className="font-medium">
										{changeResult.newPlanName}
									</span>
									<span className="text-muted-foreground">
										MikroTik:
									</span>
									<span>
										{changeResult.disconnected
											? "User disconnected (will reconnect on the new plan)"
											: "User was not online"}
									</span>
								</div>
							</div>
						</>
					) : (
						<>
							<DialogHeader>
								<div className="flex items-center gap-2">
									<AlertCircleIcon className="size-5 text-destructive" />
									<DialogTitle>
										Plan change failed
									</DialogTitle>
								</div>
								<DialogDescription>
									iRadius did not accept the change. Local
									data was not updated.
								</DialogDescription>
							</DialogHeader>
							<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
								<p className="font-medium text-destructive">
									{changeResult?.error}
								</p>
							</div>
						</>
					)}
					<DialogFooter>
						<Button onClick={() => setChangeResult(null)}>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Deactivate confirmation */}
			<AlertDialog
				open={confirmDeactivate}
				onOpenChange={setConfirmDeactivate}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Deactivate customer?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This sets the customer status to inactive. You can
							reactivate them later.
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

			{/* Reactivate confirmation. Mirrors the Deactivate flow: status
			    change always mirrors to iRadius (see updateCustomer's remote
			    block), so we don't need a separate `syncToIRadius` flag. */}
			<AlertDialog
				open={confirmReactivate}
				onOpenChange={setConfirmReactivate}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Reactivate customer?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This sets the customer status back to active and
							re-enables their connection in iRadius.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (!organizationId) {
									return;
								}
								updateCustomer.mutate({
									organizationId,
									id: customerId,
									status: "ACTIVE",
								});
							}}
						>
							Reactivate
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}

// ─── Phone field group ─────────────────────────────────────────────────

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
		const updated = phones.map((p, i) => ({ ...p, primary: i === index }));
		form.setFieldValue("phones", updated);
	}

	return (
		<div className="space-y-2">
			<FieldLabel>Phone numbers</FieldLabel>
			<div className="space-y-2">
				{phones.map((phone, index) => (
					<div key={index} className="flex items-center gap-1.5">
						<PhoneInput
							value={phone.number}
							onChange={(val) => updatePhone(index, val)}
							className="min-w-0 flex-1"
						/>
						<Button
							type="button"
							variant={phone.primary ? "primary" : "outline"}
							size="sm"
							className="h-9 shrink-0 px-2 text-xs"
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
								className="size-9 shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
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
						<PlusIcon className="mr-1 size-3.5" />
						Add phone
					</Button>
				)}
			</div>
		</div>
	);
}

// ─── Tabs ──────────────────────────────────────────────────────────────

function ProfileTab({
	form,
	customer,
	customerId,
}: {
	form: CustomerForm;
	customer: CustomerData;
	customerId: string;
}) {
	const organizationId = useOrganizationId();

	return (
		<>
			<DetailSection
				title="Personal information"
				description="Customer identity and contact details"
			>
				<FieldGroup columns={2}>
					<form.Field name="firstName">
						{(field) => (
							<Field>
								<FieldLabel htmlFor="firstName">
									First name
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
									Last name
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
								<FieldLabel htmlFor="email">Email</FieldLabel>
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

			{/* Both sections are short single-row content — side-by-side at
			    lg+ removes the wasted horizontal space on desktop. */}
			<div className="grid gap-6 lg:grid-cols-2">
				{organizationId && (
					<CustomerLocationSection
						organizationId={organizationId}
						customerId={customerId}
						latitude={customer.latitude}
						longitude={customer.longitude}
						locationRequestedAt={customer.locationRequestedAt}
					/>
				)}

				<AccountPinSection
					customer={customer}
					customerId={customerId}
				/>
			</div>
		</>
	);
}

function ServiceTab({
	form,
	customer,
	plans,
	employees,
	iradiusGroups,
}: {
	form: CustomerForm;
	customer: CustomerData;
	plans: PlanItem[];
	employees: EmployeeItem[];
	iradiusGroups: Array<{ id: number; name: string }>;
}) {
	const hasIRadiusBillingExtras =
		customer.discount > 0 ||
		customer.iptvPrice > 0 ||
		customer.realIpPrice > 0 ||
		customer.deductMoney;

	return (
		<>
			<DetailSection
				title="Service"
				description="Plan, status, and assignment"
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
											<SelectItem key={p.id} value={p.id}>
												{p.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
					<form.Field name="status">
						{(field) => (
							<Field>
								<FieldLabel>Account status</FieldLabel>
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
					<form.Field name="connectionType">
						{(field) => (
							<Field>
								<FieldLabel>Connection type</FieldLabel>
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
											<SelectItem key={e.id} value={e.id}>
												{e.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
					<form.Field name="groupExternalId">
						{(field) => (
							<Field>
								<FieldLabel>Group</FieldLabel>
								<Select
									value={field.state.value || "none"}
									onValueChange={(v) =>
										field.handleChange(
											v === "none" ? "" : v,
										)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select group" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">
											<span className="text-muted-foreground">
												None
											</span>
										</SelectItem>
										{iradiusGroups.map((g) => (
											<SelectItem
												key={g.id}
												value={String(g.id)}
											>
												{g.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>
					<ReadOnlyField
						label="PPPoE username"
						value={customer.username}
						mono
						copyable
					/>
				</FieldGroup>

				<Separator />

				<FieldGroup columns={2}>
					<ReadOnlyField
						label="Station"
						value={customer.station?.name}
					/>
					<ReadOnlyField
						label="Access point"
						value={customer.accessPoint?.name}
					/>
				</FieldGroup>
			</DetailSection>

			{/* Billing has only 2 inputs (+ optional read-only iRadius row);
			    Notes is a constrained 5-row textarea. Pairing them at lg+
			    closes a big stretch of whitespace under the Service block. */}
			<div className="grid gap-6 lg:grid-cols-2">
				<DetailSection
					title="Billing"
					description="Monthly rate and balance for this customer"
				>
					<FieldGroup columns={2}>
						<form.Field name="monthlyRate">
							{(field) => (
								<Field>
									<FieldLabel htmlFor="monthlyRate">
										Monthly rate ($)
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
										Leave empty to use the plan default
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
									<FieldDescription>
										Running credit/debit on the account
									</FieldDescription>
								</Field>
							)}
						</form.Field>
					</FieldGroup>

					{hasIRadiusBillingExtras && (
						<>
							<Separator />
							<div>
								<p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
									Synced from iRadius{" "}
									<span className="ml-1 normal-case tracking-normal text-muted-foreground/70">
										— change via the iRadius menu
									</span>
								</p>
								<FieldGroup columns={4}>
									<ReadOnlyField
										label="Discount"
										value={
											customer.discount > 0
												? formatCurrency(
														customer.discount,
													)
												: null
										}
									/>
									<ReadOnlyField
										label="IPTV price"
										value={
											customer.iptvPrice > 0
												? formatCurrency(
														customer.iptvPrice,
													)
												: null
										}
									/>
									<ReadOnlyField
										label="Real IP price"
										value={
											customer.realIpPrice > 0
												? formatCurrency(
														customer.realIpPrice,
													)
												: null
										}
									/>
									<ReadOnlyField
										label="Deduct money"
										value={customer.deductMoney}
									/>
								</FieldGroup>
							</div>
						</>
					)}
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
								placeholder="Add notes about this customer…"
							/>
						)}
					</form.Field>
				</DetailSection>
			</div>
		</>
	);
}

function NetworkTab({ customer }: { customer: CustomerData }) {
	return (
		<>
			{/* Row 1 — Connection (wide reference) + Bandwidth (compact 2×2 hero).
			    Connection holds the IP/MAC/NAS data operators glance at first; the
			    bandwidth strip sits next to it so the whole transport picture is
			    visible without scrolling. */}
			<div className="grid gap-3 lg:grid-cols-3">
				<DetailSection
					title="Connection"
					description="IP, MAC and NAS — iRadius-owned, read-only"
					className="lg:col-span-2"
				>
					<PropertyList
						columns={3}
						items={[
							{
								label: "IP address",
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
								label: "MAC address",
								value: customer.macAddress,
								mono: true,
								copyable: true,
							},
							{
								label: "NAS host",
								value: customer.nasHost,
								mono: true,
								copyable: true,
							},
							{
								label: "MikroTik user",
								value: customer.mikrotikUser,
								mono: true,
							},
							{
								label: "MikroTik interface",
								value: customer.mikrotikInterface,
							},
							{
								label: "MikroTik interface 2",
								value: customer.mikrotikInterface1,
							},
							{
								label: "MikroTik queue",
								value: customer.mikrotikQueue,
							},
							{
								label: "Wireless interface",
								value: customer.wirelessInterface,
							},
							{
								label: "Router brand prefix",
								value: customer.routerBrandPrefix,
								mono: true,
							},
						]}
					/>
				</DetailSection>

				<DetailSection title="Bandwidth">
					<MetricStrip columns={2}>
						<MetricCard
							label="Total ↓"
							value={formatBytesNum(customer.downloadBytes)}
						/>
						<MetricCard
							label="Total ↑"
							value={formatBytesNum(customer.uploadBytes)}
						/>
						<MetricCard
							label="Daily ↓"
							value={formatBytesNum(customer.dailyDownloadBytes)}
						/>
						<MetricCard
							label="Daily ↑"
							value={formatBytesNum(customer.dailyUploadBytes)}
						/>
					</MetricStrip>
				</DetailSection>
			</div>

			{/* Row 2 — Three exception-data panels side-by-side. Status flags
			    and Overrides used to share a row; Allowances is the merger of
			    the old "Free quotas" + "Extras" sections. We zero-strip
			    Allowances so customers with no special quotas don't render a
			    wall of "0 B" cells. */}
			<div className="grid gap-3 lg:grid-cols-3">
				<DetailSection
					title="Status flags"
					description="Feature toggles"
				>
					<PropertyList
						columns={2}
						items={[
							{ label: "FUP mode", value: customer.fupMode },
							{
								label: "Auto renew",
								value: customer.automaticRenew,
							},
							{
								label: "Simultaneous",
								value: customer.simultaneous,
							},
							{
								label: "AP electrical",
								value: customer.apElectrical,
							},
							{ label: "Temp user", value: customer.tempUser },
							{ label: "Read only", value: customer.readOnly },
							{
								label: "Reach max quota",
								value: customer.reachMaxQuota,
							},
							{
								label: "Show traffic",
								value: customer.canShowTrafficDetails,
							},
						]}
					/>
				</DetailSection>

				<DetailSection
					title="Overrides"
					description="Recharge and expiry overrides"
				>
					<PropertyList
						columns={2}
						items={[
							{
								label: "Force override recharge",
								value: customer.forceOverrideImmediateRecharge,
							},
							{
								label: "Override recharge",
								value: customer.overrideImmediateRecharge,
							},
							{
								label: "Force auto bind MAC",
								value: customer.forceAutoBindAccToMac,
							},
							{
								label: "Override auto bind MAC",
								value: customer.overrideAutoBindAccToMac,
							},
							{
								label: "Force expiry days",
								value: customer.forceExpiryAfterDays,
							},
							{
								label: "Override expiry",
								value: customer.overrideExpiryAccount
									? formatDate(customer.overrideExpiryAccount)
									: null,
							},
							{
								label: "Temp expiry",
								value: customer.tempExpiryAccount
									? formatDate(customer.tempExpiryAccount)
									: null,
							},
						]}
					/>
				</DetailSection>

				<DetailSection
					title="Allowances"
					description="Free quotas and extras"
				>
					<PropertyList
						columns={2}
						items={[
							{
								label: "Free DL",
								value: nonZeroBytes(customer.freeDownloadBytes),
							},
							{
								label: "Free UL",
								value: nonZeroBytes(customer.freeUploadBytes),
							},
							{
								label: "Daily free ↓",
								value: nonZeroBytes(
									customer.freeDailyDownloadBytes,
								),
							},
							{
								label: "Daily free ↑",
								value: nonZeroBytes(
									customer.freeDailyUploadBytes,
								),
							},
							{
								label: "Extra DL GB",
								value: nonZero(customer.extraDownloadGb),
							},
							{
								label: "Extra UL GB",
								value: nonZero(customer.extraUploadGb),
							},
							{
								label: "Days +",
								value: nonZero(customer.extraDaysToAddOnRefill),
							},
							{
								label: "Days −",
								value: nonZero(
									customer.extraDaysToDeductOnRefill,
								),
							},
							{
								label: "Added hours",
								value: nonZero(customer.addedHours),
							},
						]}
					/>
				</DetailSection>
			</div>

			{/* Row 3 — iRadius metadata split into Lifecycle (when things
			    happened) on the left and References (what links to what) on
			    the right. Keeping them paired uses the wide screen instead of
			    one full-width 21-item block that scrolls. */}
			<div className="grid gap-3 lg:grid-cols-3">
				<DetailSection
					title="iRadius lifecycle"
					description="Timestamps from the legacy system"
				>
					<PropertyList
						columns={2}
						items={[
							{
								label: "External ID",
								value: customer.externalId,
								mono: true,
							},
							{
								label: "Original created",
								value: customer.originalCreatedAt
									? formatDate(customer.originalCreatedAt)
									: null,
							},
							{
								label: "Activated",
								value: customer.activatedAt
									? formatDate(customer.activatedAt)
									: null,
							},
							{
								label: "Service expiry",
								value: customer.expiresAt
									? formatDate(customer.expiresAt)
									: null,
							},
							{
								label: "Last login",
								value: customer.lastLogin
									? formatDateTime(customer.lastLogin)
									: null,
							},
							{
								label: "Last log out",
								value: customer.lastLogOut
									? formatDateTime(customer.lastLogOut)
									: null,
							},
							{
								label: "NAS last log out",
								value: customer.nasLastLogOut
									? formatDateTime(customer.nasLastLogOut)
									: null,
							},
						]}
					/>
				</DetailSection>

				<DetailSection
					title="iRadius references"
					description="Account, collector and category links"
					className="lg:col-span-2"
				>
					<PropertyList
						columns={3}
						items={[
							{ label: "MOF", value: customer.mof },
							{ label: "Category", value: customer.categoryName },
							{ label: "Group", value: customer.groupName },
							{
								label: "Collector",
								value: customer.collectorName,
							},
							{
								label: "Collector phone",
								value: customer.collectorPhone,
							},
							{
								label: "NAS account ID",
								value: customer.nasAccountId,
							},
							{
								label: "Old account type",
								value: customer.oldAccountTypeId,
							},
							{
								label: "Forward account type",
								value: customer.forwardAccountTypeId,
							},
							{
								label: "Condition account type",
								value: customer.conditionAccountTypeId,
							},
							{ label: "Link ID", value: customer.linkId },
							{
								label: "Financial category",
								value: customer.financialCategoryId,
							},
							{
								label: "Can reset account",
								value: customer.canResetAccount,
							},
							{
								label: "Collector reset MAC",
								value: customer.collectorResetMac,
							},
							{
								label: "Collector show links",
								value: customer.collectorCanShowLinks,
							},
							{
								label: "Auto generate invoice",
								value: customer.autoGenerateInvoice,
							},
						]}
					/>
				</DetailSection>
			</div>
		</>
	);
}

function ActivityTab({
	customerId,
	organizationSlug,
}: {
	customerId: string;
	organizationSlug: string;
}) {
	return (
		<>
			<DetailSection
				title="Recent activity"
				description="Unified timeline across payments, invoices, location, tasks and audit log"
			>
				<AsyncBoundary
					fallback={
						<div className="space-y-1.5">
							{[0, 1, 2, 3, 4].map((i) => (
								<Skeleton
									key={i}
									className="h-11 w-full rounded-md"
								/>
							))}
						</div>
					}
					errorFallback="inline"
				>
					<CustomerActivityTimeline customerId={customerId} />
				</AsyncBoundary>
			</DetailSection>
			<DetailSection title="Payments">
				<CustomerPayments
					customerId={customerId}
					organizationSlug={organizationSlug}
				/>
			</DetailSection>
			<DetailSection title="Invoices">
				<CustomerInvoices customerId={customerId} />
			</DetailSection>
			<DetailSection title="Transactions">
				<CustomerTransactions customerId={customerId} />
			</DetailSection>
		</>
	);
}

// ─── Account PIN section (lives on Profile tab) ────────────────────────

function AccountPinSection({
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
				loading: "Setting PIN…",
				success: () => {
					setShowSetPin(false);
					setManualPin("");
					return "PIN set";
				},
				error: (err: { message?: string }) =>
					err?.message ?? "Failed to set PIN",
			},
		);
	}

	return (
		<DetailSection
			title="Account PIN"
			description="6-digit PIN for customer self-service access"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="text-sm">
					<p className="text-muted-foreground">
						{customer.pin ? "Current PIN" : "No PIN configured"}
					</p>
					{customer.pin && (
						<p className="mt-0.5 font-mono text-base font-medium tabular-nums">
							{customer.pin}
						</p>
					)}
				</div>
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
									.mutateAsync({ organizationId, customerId })
									.then((res: { pin: string }) => {
										setGeneratedPin(res.pin);
										return res;
									}),
								{
									loading: "Generating…",
									success: "PIN generated",
									error: "Failed to generate PIN",
								},
							);
						}}
					>
						Generate random
					</Button>
					{customer.pin && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="text-destructive"
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
										loading: "Resetting…",
										success: "PIN removed",
										error: "Failed to reset PIN",
									},
								);
							}}
						>
							Remove PIN
						</Button>
					)}
				</div>
			</div>
			{generatedPin && (
				<p className="text-sm">
					Generated PIN:{" "}
					<span className="font-mono font-bold">{generatedPin}</span>
				</p>
			)}

			<Dialog open={showSetPin} onOpenChange={setShowSetPin}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Set account PIN</DialogTitle>
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
		</DetailSection>
	);
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatBytesNum(v: bigint | number | null | undefined): string {
	const n = v == null ? 0 : typeof v === "bigint" ? Number(v) : v;
	if (n === 0) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = n;
	let i = 0;
	while (Math.abs(value) >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	const decimals = value < 10 && i > 0 ? 2 : value < 100 && i > 0 ? 1 : 0;
	return `${value.toFixed(decimals)} ${units[i]}`;
}

/** Returns null when the byte count is 0/null so PropertyList hides the row.
 *  Used in the Allowances section — most customers have no extra quotas, and
 *  rendering "0 B" four times is just visual noise. */
function nonZeroBytes(v: bigint | number | null | undefined): string | null {
	const n = v == null ? 0 : typeof v === "bigint" ? Number(v) : v;
	return n === 0 ? null : formatBytesNum(n);
}

/** Returns null for 0/null/undefined so PropertyList drops the row. */
function nonZero(v: number | null | undefined): number | null {
	return v == null || v === 0 ? null : v;
}
