"use client";

import { DetailPanel, DetailSection } from "@shared/components/DetailPanel";
import { FieldGroup, ReadOnlyField } from "@shared/components/FieldGroup";
import { PageShell } from "@shared/components/PageShell";
import { PropertyList } from "@shared/components/PropertyList";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useForm, useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
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

export function DealerDetail({ dealerId }: { dealerId: string }) {
	const organizationId = useOrganizationId();
	const { organizationSlug } = useParams({ strict: false });
	const updateDealer = useUpdateDealer();
	const deleteDealer = useDeleteDealer();

	const { data } = useSuspenseQuery(
		orpc.dealers.get.queryOptions({
			input: {
				organizationId: organizationId ?? "",
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
			if (!organizationId) {
				return;
			}
			try {
				await updateDealer.mutateAsync({
					organizationId,
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
			backTo={`/app/${organizationSlug}/dealers`}
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
							if (
								organizationId &&
								confirm("Deactivate this dealer?")
							) {
								deleteDealer.mutate({
									organizationId,
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
											<div className="rounded-xl shadow-card overflow-hidden">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>
																Date
															</TableHead>
															<TableHead>
																Credit
															</TableHead>
															<TableHead>
																Debit
															</TableHead>
															<TableHead>
																Balance
															</TableHead>
															<TableHead className="hidden md:table-cell">
																Comment
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{dealer.dealerAccounts.map(
															(account) => (
																<TableRow
																	key={
																		account.id
																	}
																>
																	<TableCell className="text-sm">
																		{account.operationDate
																			? new Date(
																					account.operationDate,
																				).toLocaleDateString()
																			: "-"}
																	</TableCell>
																	<TableCell className="text-sm font-mono">
																		$
																		{(
																			account.credit ??
																			0
																		).toFixed(
																			2,
																		)}
																	</TableCell>
																	<TableCell className="text-sm font-mono">
																		$
																		{(
																			account.debit ??
																			0
																		).toFixed(
																			2,
																		)}
																	</TableCell>
																	<TableCell className="text-sm font-mono">
																		$
																		{(
																			account.balance ??
																			0
																		).toFixed(
																			2,
																		)}
																	</TableCell>
																	<TableCell className="hidden text-sm md:table-cell">
																		{account.comment ??
																			"-"}
																	</TableCell>
																</TableRow>
															),
														)}
													</TableBody>
												</Table>
											</div>
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
															to="/app/$organizationSlug/dealers/$dealerId"
															params={{
																organizationSlug:
																	organizationSlug ??
																	"",
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
																			to="/app/$organizationSlug/dealers/$dealerId"
																			params={{
																				organizationSlug:
																					organizationSlug ??
																					"",
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
												<div className="rounded-xl shadow-card overflow-hidden">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>
																	Name
																</TableHead>
																<TableHead>
																	Monthly
																	Price
																</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{dealer.servicePlans.map(
																(plan) => (
																	<TableRow
																		key={
																			plan.id
																		}
																	>
																		<TableCell className="text-sm">
																			{
																				plan.name
																			}
																		</TableCell>
																		<TableCell className="text-sm font-mono">
																			$
																			{(
																				plan.monthlyPrice ??
																				0
																			).toFixed(
																				2,
																			)}
																		</TableCell>
																	</TableRow>
																),
															)}
														</TableBody>
													</Table>
												</div>
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
