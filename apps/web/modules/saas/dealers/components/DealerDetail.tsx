"use client";

import { DetailPanel, DetailSection } from "@shared/components/DetailPanel";
import { FieldGroup, ReadOnlyField } from "@shared/components/FieldGroup";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { formatCurrency } from "@shared/lib/format";
import { orpc, type orpcClient } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@ui/components/button";
import { DataTable } from "@ui/components/data-table";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Switch } from "@ui/components/switch";
import {
	BuildingIcon,
	DollarSignIcon,
	LinkIcon,
	ShieldCheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useDeleteDealer, useUpdateDealer } from "../hooks/use-dealers";
import { DEALER_STATUS_LABELS, DEALER_STATUS_OPTIONS } from "../lib/constants";

const PERMISSION_LABELS: Record<string, string> = {
	canShowRate: "Show Rate",
	canShowSpeed: "Show Speed",
	noCharge: "No Charge",
	canSendMail: "Send Mail",
	canSendSms: "Send SMS",
	canExportToExcel: "Export to Excel",
	canAddDealer: "Add Dealer",
	canDeleteUser: "Delete User",
	canChangeAccountType: "Change Account Type",
	notifyBefore3Days: "Notify 3 Days Before",
	notifyBefore2Days: "Notify 2 Days Before",
	notifyBefore1Day: "Notify 1 Day Before",
	extraGb: "Extra GB",
	canShowOnlineUsersSpeed: "Show Online Users Speed",
	userNotification: "User Notification",
	canMonitorLog: "Monitor Log",
	chargeIfNotExpiry: "Charge If Not Expired",
};

type DealerAccount = NonNullable<
	Awaited<ReturnType<typeof orpcClient.admin.dealers.get>>["dealer"]
>["dealerAccounts"][number];

type ServicePlan = NonNullable<
	Awaited<ReturnType<typeof orpcClient.admin.dealers.get>>["dealer"]
>["servicePlans"][number];

const accountColumns: ColumnDef<DealerAccount, unknown>[] = [
	{
		accessorKey: "operationDate",
		header: "Date",
		cell: ({ row }) => (
			<span className="text-sm">
				{row.original.operationDate
					? new Date(row.original.operationDate).toLocaleDateString()
					: "-"}
			</span>
		),
	},
	{
		accessorKey: "credit",
		header: "Credit",
		cell: ({ row }) => (
			<span className="text-sm font-mono">
				{formatCurrency(row.original.credit ?? 0)}
			</span>
		),
	},
	{
		accessorKey: "debit",
		header: "Debit",
		cell: ({ row }) => (
			<span className="text-sm font-mono">
				{formatCurrency(row.original.debit ?? 0)}
			</span>
		),
	},
	{
		accessorKey: "balance",
		header: "Balance",
		cell: ({ row }) => (
			<span className="text-sm font-mono">
				{formatCurrency(row.original.balance ?? 0)}
			</span>
		),
	},
	{
		accessorKey: "comment",
		header: "Comment",
		meta: { className: "hidden md:table-cell" },
		cell: ({ row }) => (
			<span className="text-sm">{row.original.comment ?? "-"}</span>
		),
	},
];

const planColumns: ColumnDef<ServicePlan, unknown>[] = [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => <span className="text-sm">{row.original.name}</span>,
	},
	{
		accessorKey: "monthlyPrice",
		header: "Monthly Price",
		cell: ({ row }) => (
			<span className="text-sm font-mono">
				{formatCurrency(row.original.monthlyPrice ?? 0)}
			</span>
		),
	},
];

export function DealerDetail({ dealerId }: { dealerId: string }) {
	const updateDealer = useUpdateDealer();
	const deleteDealer = useDeleteDealer();

	const { data } = useSuspenseQuery(
		orpc.admin.dealers.get.queryOptions({
			input: {
				id: dealerId,
			},
		}),
	);

	const dealer = data.dealer;

	const form = useForm({
		defaultValues: {
			name: dealer.name,
			username: dealer.username ?? "",
			email: dealer.email ?? "",
			phone: dealer.phone ?? "",
			companyName: dealer.companyName ?? "",
			companyAddress: dealer.companyAddress ?? "",
			companyPhone: dealer.companyPhone ?? "",
			companyMobile: dealer.companyMobile ?? "",
			companyVatNumber: dealer.companyVatNumber ?? "",
			status: dealer.status,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateDealer.mutateAsync({
					id: dealerId,
					name: value.name,
					username: value.username || undefined,
					email: value.email || undefined,
					phone: value.phone || undefined,
					companyName: value.companyName || undefined,
					companyAddress: value.companyAddress || undefined,
					companyPhone: value.companyPhone || undefined,
					companyMobile: value.companyMobile || undefined,
					companyVatNumber: value.companyVatNumber || undefined,
					status: value.status as
						| "ACTIVE"
						| "INACTIVE"
						| "SUSPENDED"
						| "PENDING",
				});
				toast.success("Dealer updated");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update dealer",
				);
			}
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

	const statusType =
		dealer.status === "ACTIVE"
			? "active"
			: dealer.status === "SUSPENDED"
				? "suspended"
				: dealer.status === "PENDING"
					? "pending"
					: "inactive";

	return (
		<PageShell
			title={dealer.name}
			backTo="/app/admin/dealers"
			backLabel="Dealers"
			subtitle={
				<span className="flex items-center gap-3">
					{dealer.username && (
						<span className="font-mono">@{dealer.username}</span>
					)}
					<StatusIndicator
						status={statusType}
						variant="badge"
						label={
							DEALER_STATUS_LABELS[dealer.status] ?? dealer.status
						}
					/>
				</span>
			}
			actions={
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							if (confirm("Deactivate this dealer?")) {
								deleteDealer.mutate({
									id: dealerId,
								});
							}
						}}
					>
						Deactivate
					</Button>
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
							icon: BuildingIcon,
							content: (
								<>
									<DetailSection title="Basic Information">
										<FieldGroup columns={2}>
											<form.Field name="name">
												{(field) => (
													<div className="space-y-2">
														<Label>Name</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="username">
												{(field) => (
													<div className="space-y-2">
														<Label>Username</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
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
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
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
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="status">
												{(field) => (
													<div className="space-y-2">
														<Label>Status</Label>
														<Select
															value={
																field.state
																	.value
															}
															onValueChange={(
																v,
															) =>
																field.handleChange(
																	v as typeof field.state.value,
																)
															}
														>
															<SelectTrigger>
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{DEALER_STATUS_OPTIONS.map(
																	(opt) => (
																		<SelectItem
																			key={
																				opt.value
																			}
																			value={
																				opt.value
																			}
																		>
																			{
																				opt.label
																			}
																		</SelectItem>
																	),
																)}
															</SelectContent>
														</Select>
													</div>
												)}
											</form.Field>
										</FieldGroup>
									</DetailSection>

									<DetailSection title="Company Information">
										<FieldGroup columns={2}>
											<form.Field name="companyName">
												{(field) => (
													<div className="space-y-2">
														<Label>
															Company Name
														</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="companyAddress">
												{(field) => (
													<div className="space-y-2">
														<Label>
															Company Address
														</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="companyPhone">
												{(field) => (
													<div className="space-y-2">
														<Label>
															Company Phone
														</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="companyMobile">
												{(field) => (
													<div className="space-y-2">
														<Label>
															Company Mobile
														</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
											<form.Field name="companyVatNumber">
												{(field) => (
													<div className="space-y-2">
														<Label>
															VAT Number
														</Label>
														<Input
															value={
																field.state
																	.value
															}
															onChange={(e) =>
																field.handleChange(
																	e.target
																		.value,
																)
															}
														/>
													</div>
												)}
											</form.Field>
										</FieldGroup>
									</DetailSection>
								</>
							),
						},
						{
							id: "financial",
							label: "Financial",
							icon: DollarSignIcon,
							content: (
								<>
									<DetailSection title="Financial Summary">
										<FieldGroup columns={3}>
											<ReadOnlyField
												label="Credit"
												value={formatCurrency(
													dealer.credit ?? 0,
												)}
											/>
											<ReadOnlyField
												label="Commission"
												value={`${dealer.commission ?? 0}%`}
											/>
											<ReadOnlyField
												label="SMS Sender ID"
												value={dealer.smsSenderId}
											/>
											<ReadOnlyField
												label="Notification Amount"
												value={
													dealer.notificationAmount
												}
											/>
											<ReadOnlyField
												label="FUP Reset Price"
												value={dealer.fupResetPrice}
											/>
											<ReadOnlyField
												label="Extra 1GB Price"
												value={dealer.extraOneGbPrice}
											/>
											<ReadOnlyField
												label="Extra 1GB Commission"
												value={
													dealer.extraOneGbCommission
												}
											/>
										</FieldGroup>
									</DetailSection>

									{dealer.dealerAccounts.length > 0 && (
										<DetailSection title="Account Transactions">
											<DataTable
												columns={accountColumns}
												data={dealer.dealerAccounts}
												pageSize={10}
											/>
										</DetailSection>
									)}
								</>
							),
						},
						{
							id: "permissions",
							label: "Permissions",
							icon: ShieldCheckIcon,
							content: (
								<DetailSection title="Access Permissions">
									<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
										{Object.entries(PERMISSION_LABELS).map(
											([key, label]) => {
												const value =
													dealer[
														key as keyof typeof dealer
													] === true;
												return (
													<div
														key={key}
														className="flex items-center justify-between rounded-lg p-3 shadow-card"
													>
														<span className="text-sm">
															{label}
														</span>
														<Switch
															checked={value}
															disabled
														/>
													</div>
												);
											},
										)}
									</div>
								</DetailSection>
							),
						},
						{
							id: "hierarchy",
							label: "Hierarchy",
							icon: LinkIcon,
							content: (
								<>
									<DetailSection title="Dealer Hierarchy">
										<PropertyList
											columns={2}
											items={[
												{
													label: "Parent Dealer",
													value: dealer.parentDealer ? (
														<Link
															to="/app/admin/dealers/$dealerId"
															params={{
																dealerId:
																	dealer
																		.parentDealer
																		.id,
															}}
															className="text-primary hover:underline"
															preload="intent"
														>
															{
																dealer
																	.parentDealer
																	.name
															}
														</Link>
													) : null,
												},
												{
													label: "Child Dealers",
													value:
														dealer.childDealers
															.length > 0 ? (
															<div className="flex flex-wrap gap-2">
																{dealer.childDealers.map(
																	(child) => (
																		<Link
																			key={
																				child.id
																			}
																			to="/app/admin/dealers/$dealerId"
																			params={{
																				dealerId:
																					child.id,
																			}}
																			className="text-sm text-primary hover:underline"
																			preload="intent"
																		>
																			{
																				child.name
																			}
																		</Link>
																	),
																)}
															</div>
														) : null,
												},
											]}
										/>
									</DetailSection>

									<DetailSection title="Related Entities">
										<FieldGroup columns={2}>
											<ReadOnlyField
												label="Customers"
												value={dealer._count.customers}
											/>
											<ReadOnlyField
												label="Employees"
												value={dealer._count.employees}
											/>
										</FieldGroup>

										{dealer.servicePlans.length > 0 && (
											<div className="mt-4">
												<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
													Service Plans
												</p>
												<DataTable
													columns={planColumns}
													data={dealer.servicePlans}
													pageSize={10}
												/>
											</div>
										)}
									</DetailSection>
								</>
							),
						},
					]}
				/>
			</form>
		</PageShell>
	);
}
