"use client";

import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { displayName } from "@shared/lib/display-name";
import {
	formatCurrency,
	formatDate,
	formatDateInput,
} from "@shared/lib/format";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
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
import { Separator } from "@ui/components/separator";
import { Textarea } from "@ui/components/textarea";
import { LockIcon, UnlockIcon, UserIcon } from "lucide-react";
import { useReducer, useState } from "react";
import { toast } from "sonner";
import {
	useCreateInvoice,
	useCurrentMonth,
	useInvoice,
	useUpdateInvoice,
} from "../hooks/use-billing";

type Mode =
	| { mode: "create"; prefilledCustomerId?: string | null }
	| { mode: "edit"; invoiceId: string };

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: Mode;
}

interface CustomerPickerValue {
	id: string;
	name: string;
	username: string | null;
}

function parseOrEmpty(value: string): number | null {
	if (value === "") {
		return null;
	}
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n : null;
}

function emptyIfNullish(n: number | null | undefined): string {
	return n == null ? "" : String(n);
}

// Editable form fields. A `null` slot means "untouched", so the field falls
// back to its current default (derived from the invoice / customer / active
// month). Once the user edits a field its draft value sticks.
interface InvoiceDraftState {
	year: number | null;
	month: number | null;
	accountPrice: string | null;
	iptvPrice: string | null;
	realIpPrice: string | null;
	discount: string | null;
	tax: string | null;
	expiryDate: string | null;
	note: string | null;
	totalWithTaxOverride: string | null;
}

const INITIAL_DRAFT: InvoiceDraftState = {
	year: null,
	month: null,
	accountPrice: null,
	iptvPrice: null,
	realIpPrice: null,
	discount: null,
	tax: null,
	expiryDate: null,
	note: null,
	totalWithTaxOverride: null,
};

type InvoiceDraftAction =
	| { type: "reset" }
	| { type: "setNumber"; field: "year" | "month"; value: number }
	| {
			type: "setString";
			field:
				| "accountPrice"
				| "iptvPrice"
				| "realIpPrice"
				| "discount"
				| "tax"
				| "expiryDate"
				| "note";
			value: string;
	  }
	| { type: "setOverride"; value: string | null };

function draftReducer(
	state: InvoiceDraftState,
	action: InvoiceDraftAction,
): InvoiceDraftState {
	switch (action.type) {
		case "reset":
			return INITIAL_DRAFT;
		case "setNumber":
			return { ...state, [action.field]: action.value };
		case "setString":
			return { ...state, [action.field]: action.value };
		case "setOverride":
			return { ...state, totalWithTaxOverride: action.value };
	}
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single invoice-form dialog; the length is JSX-heavy markup (line items, totals, customer panel) sharing one draft reducer, splitting would scatter tightly-coupled form state
export function InvoiceFormDialog({ open, onOpenChange, mode }: Props) {
	const organizationId = useOrganizationId();
	const isEdit = mode.mode === "edit";

	const { data: currentMonthData } = useCurrentMonth();
	const activeMonth = currentMonthData?.month;

	const { data: invoiceData } = useInvoice(
		mode.mode === "edit" ? mode.invoiceId : null,
	);
	const invoice = invoiceData?.invoice;

	const [customer, setCustomer] = useState<CustomerPickerValue | null>(null);
	const prefilledCustomerId =
		mode.mode === "create" ? (mode.prefilledCustomerId ?? null) : null;
	const selectedCustomerId = isEdit
		? (invoice?.customer.id ?? null)
		: (prefilledCustomerId ?? customer?.id ?? null);

	// Skip the full customer fetch in edit mode — invoice line items are
	// already frozen and the info panel is only shown when picking a customer.
	const { data: customerFull } = useQuery(
		!isEdit && organizationId && selectedCustomerId
			? orpc.customers.get.queryOptions({
					input: { organizationId, id: selectedCustomerId },
				})
			: disabledQuery(["customers", "get"]),
	);
	const cust = customerFull?.customer;

	const [draft, dispatch] = useReducer(draftReducer, INITIAL_DRAFT);

	// Current default for each field, derived from whichever async source is
	// authoritative for the active mode. In edit mode the (frozen) invoice
	// wins; in create mode the picked customer + active billing month win.
	const defaults = {
		year: isEdit ? (invoice?.year ?? 0) : (activeMonth?.year ?? 0),
		month: isEdit ? (invoice?.month ?? 0) : (activeMonth?.month ?? 0),
		accountPrice: isEdit
			? emptyIfNullish(invoice?.accountPrice)
			: emptyIfNullish(cust?.monthlyRate ?? cust?.plan?.monthlyPrice),
		iptvPrice: isEdit
			? emptyIfNullish(invoice?.iptvPrice)
			: emptyIfNullish(cust?.iptvPrice),
		realIpPrice: isEdit
			? emptyIfNullish(invoice?.realIpPrice)
			: emptyIfNullish(cust?.realIpPrice),
		discount: isEdit
			? invoice
				? String(invoice.discount)
				: "0"
			: cust
				? emptyIfNullish(cust.discount)
				: "0",
		tax: isEdit && invoice ? String(invoice.tax) : "0",
		expiryDate:
			isEdit && invoice?.expiryDate
				? formatDateInput(invoice.expiryDate)
				: "",
		note: isEdit ? (invoice?.note ?? "") : "",
	};

	const year = draft.year ?? defaults.year;
	const month = draft.month ?? defaults.month;
	const accountPrice = draft.accountPrice ?? defaults.accountPrice;
	const iptvPrice = draft.iptvPrice ?? defaults.iptvPrice;
	const realIpPrice = draft.realIpPrice ?? defaults.realIpPrice;
	const discount = draft.discount ?? defaults.discount;
	const tax = draft.tax ?? defaults.tax;
	const expiryDate = draft.expiryDate ?? defaults.expiryDate;
	const note = draft.note ?? defaults.note;
	const totalWithTaxOverride = draft.totalWithTaxOverride;

	function handleOpenChange(next: boolean) {
		if (!next) {
			setCustomer(null);
			dispatch({ type: "reset" });
		}
		onOpenChange(next);
	}

	const ap = parseOrEmpty(accountPrice);
	const ip = parseOrEmpty(iptvPrice);
	const rp = parseOrEmpty(realIpPrice);
	const hasLineItems = ap !== null || ip !== null || rp !== null;
	const dc = parseOrEmpty(discount) ?? 0;
	const tx = parseOrEmpty(tax) ?? 0;
	const lineSum = (ap ?? 0) + (ip ?? 0) + (rp ?? 0);
	const total = hasLineItems ? Math.max(0, lineSum - dc) : 0;
	const computedTotalWithTax = total + tx;
	const isLocked = totalWithTaxOverride === null;
	const totalWithTax = isLocked
		? computedTotalWithTax
		: (parseOrEmpty(totalWithTaxOverride) ?? computedTotalWithTax);

	const create = useCreateInvoice();
	const update = useUpdateInvoice();
	const isPending = create.isPending || update.isPending;

	function submit() {
		if (!organizationId) {
			return;
		}
		if (!isEdit && !selectedCustomerId) {
			toast.error("Select a customer");
			return;
		}
		if (!hasLineItems) {
			toast.error(
				"Enter at least one line item (account price, IPTV, etc.)",
			);
			return;
		}
		if (!year || !month) {
			toast.error("Pick a billing month");
			return;
		}

		const payload = {
			accountPrice: ap,
			iptvPrice: ip,
			realIpPrice: rp,
			total,
			discount: dc,
			tax: tx,
			totalWithTax,
			...(expiryDate
				? { expiryDate: new Date(expiryDate).toISOString() }
				: {}),
			note: note.trim() ? note.trim() : null,
		};

		if (isEdit && invoice) {
			update.mutate(
				{
					organizationId,
					invoiceId: invoice.id,
					...payload,
				},
				{
					onSuccess: () => {
						toast.success("Invoice updated");
						handleOpenChange(false);
					},
					onError: (err) => toast.error(err.message || "Failed"),
				},
			);
		} else if (selectedCustomerId) {
			create.mutate(
				{
					organizationId,
					customerId: selectedCustomerId,
					year,
					month,
					accountPrice: ap ?? undefined,
					iptvPrice: ip ?? undefined,
					realIpPrice: rp ?? undefined,
					total,
					discount: dc,
					tax: tx,
					totalWithTax,
					...(expiryDate
						? { expiryDate: new Date(expiryDate).toISOString() }
						: {}),
					...(note.trim() ? { note: note.trim() } : {}),
				},
				{
					onSuccess: () => {
						toast.success("Invoice created");
						handleOpenChange(false);
					},
					onError: (err) => toast.error(err.message || "Failed"),
				},
			);
		}
	}

	const title = isEdit ? "Edit Invoice" : "New Invoice";
	let description = "";
	if (!isEdit) {
		description = "Create an invoice for a customer.";
	} else if (invoice) {
		description = `${displayName(invoice.customer.firstName, invoice.customer.lastName)} — ${String(invoice.month).padStart(2, "0")}/${invoice.year}`;
	}

	const showCustomerPicker = !isEdit && !prefilledCustomerId;

	function submitLabel() {
		if (isPending) {
			return isEdit ? "Saving..." : "Creating...";
		}
		return isEdit ? "Save" : "Create Invoice";
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Customer picker (create mode without prefill) */}
					{showCustomerPicker && (
						<div>
							<Label>Customer</Label>
							<CustomerCombobox
								value={customer}
								onChange={setCustomer}
								placeholder="Search by name or username…"
							/>
						</div>
					)}

					{/* Customer context panel */}
					{cust && (
						<div className="rounded-lg border bg-muted/40 p-3 text-sm">
							<div className="flex items-start gap-2">
								<UserIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<span className="font-medium">
											{displayName(
												cust.firstName,
												cust.lastName,
											)}
										</span>
										{cust.username && (
											<span className="font-mono text-xs text-muted-foreground">
												@{cust.username}
											</span>
										)}
										{cust.groupName && (
											<Badge
												variant="secondary"
												className="text-xs"
											>
												{cust.groupName}
											</Badge>
										)}
									</div>
									<div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-3">
										{cust.mobile && (
											<span>📱 {cust.mobile}</span>
										)}
										{cust.plan?.name && (
											<span>📡 {cust.plan.name}</span>
										)}
										{cust.expiresAt && (
											<span>
												🗓 Expires{" "}
												{formatDate(cust.expiresAt)}
											</span>
										)}
										{cust.address && (
											<span className="col-span-2 truncate sm:col-span-3">
												📍 {cust.address}
											</span>
										)}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Billing month (create only) */}
					{!isEdit && (
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label htmlFor="year">Year</Label>
								<Input
									id="year"
									type="number"
									value={year || ""}
									onChange={(e) =>
										dispatch({
											type: "setNumber",
											field: "year",
											value:
												Number.parseInt(
													e.target.value,
													10,
												) || 0,
										})
									}
								/>
							</div>
							<div>
								<Label htmlFor="month">Month</Label>
								<Input
									id="month"
									type="number"
									min={1}
									max={12}
									value={month || ""}
									onChange={(e) =>
										dispatch({
											type: "setNumber",
											field: "month",
											value:
												Number.parseInt(
													e.target.value,
													10,
												) || 0,
										})
									}
								/>
							</div>
						</div>
					)}

					{/* Line items */}
					<div>
						<div className="mb-2 flex items-center justify-between">
							<Label>Line items</Label>
							<span className="text-xs text-muted-foreground">
								Edit or clear to match the invoice
							</span>
						</div>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div>
								<Label
									htmlFor="accountPrice"
									className="text-xs text-muted-foreground"
								>
									Account Price
								</Label>
								<Input
									id="accountPrice"
									type="number"
									step="0.01"
									value={accountPrice}
									onChange={(e) =>
										dispatch({
											type: "setString",
											field: "accountPrice",
											value: e.target.value,
										})
									}
									placeholder="0.00"
								/>
							</div>
							<div>
								<Label
									htmlFor="iptvPrice"
									className="text-xs text-muted-foreground"
								>
									IPTV
								</Label>
								<Input
									id="iptvPrice"
									type="number"
									step="0.01"
									value={iptvPrice}
									onChange={(e) =>
										dispatch({
											type: "setString",
											field: "iptvPrice",
											value: e.target.value,
										})
									}
									placeholder="0.00"
								/>
							</div>
							<div>
								<Label
									htmlFor="realIpPrice"
									className="text-xs text-muted-foreground"
								>
									Real IP
								</Label>
								<Input
									id="realIpPrice"
									type="number"
									step="0.01"
									value={realIpPrice}
									onChange={(e) =>
										dispatch({
											type: "setString",
											field: "realIpPrice",
											value: e.target.value,
										})
									}
									placeholder="0.00"
								/>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="discount">Discount</Label>
							<Input
								id="discount"
								type="number"
								step="0.01"
								value={discount}
								onChange={(e) =>
									dispatch({
										type: "setString",
										field: "discount",
										value: e.target.value,
									})
								}
							/>
						</div>
						<div>
							<Label htmlFor="tax">Tax</Label>
							<Input
								id="tax"
								type="number"
								step="0.01"
								value={tax}
								onChange={(e) =>
									dispatch({
										type: "setString",
										field: "tax",
										value: e.target.value,
									})
								}
							/>
						</div>
					</div>

					{/* Totals summary */}
					<div className="rounded-lg border bg-muted/30 p-3 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Subtotal
							</span>
							<span className="tabular-nums">
								{formatCurrency(lineSum)}
							</span>
						</div>
						{dc > 0 && (
							<div className="flex justify-between text-success">
								<span>Discount</span>
								<span className="tabular-nums">
									-{formatCurrency(dc)}
								</span>
							</div>
						)}
						<div className="flex justify-between">
							<span className="text-muted-foreground">Total</span>
							<span className="font-medium tabular-nums">
								{formatCurrency(total)}
							</span>
						</div>
						{tx > 0 && (
							<div className="flex justify-between text-muted-foreground">
								<span>Tax</span>
								<span className="tabular-nums">
									+{formatCurrency(tx)}
								</span>
							</div>
						)}
						<Separator className="my-2" />
						<div className="flex items-center justify-between gap-2">
							<span className="font-semibold">Total (TTC)</span>
							<div className="flex items-center gap-2">
								{isLocked ? (
									<span className="font-semibold tabular-nums">
										{formatCurrency(totalWithTax)}
									</span>
								) : (
									<Input
										type="number"
										step="0.01"
										value={totalWithTaxOverride ?? ""}
										onChange={(e) =>
											dispatch({
												type: "setOverride",
												value: e.target.value,
											})
										}
										className="h-8 w-32 text-right"
									/>
								)}
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7"
									onClick={() =>
										dispatch({
											type: "setOverride",
											value: isLocked
												? String(computedTotalWithTax)
												: null,
										})
									}
									title={
										isLocked
											? "Override Total (TTC)"
											: "Auto-compute Total (TTC)"
									}
								>
									{isLocked ? (
										<LockIcon className="size-3.5" />
									) : (
										<UnlockIcon className="size-3.5" />
									)}
								</Button>
							</div>
						</div>
					</div>

					<div>
						<Label htmlFor="expiryDate">Due date</Label>
						<Input
							id="expiryDate"
							type="date"
							value={expiryDate}
							onChange={(e) =>
								dispatch({
									type: "setString",
									field: "expiryDate",
									value: e.target.value,
								})
							}
						/>
					</div>

					<div>
						<Label htmlFor="note">Note</Label>
						<Textarea
							id="note"
							value={note}
							onChange={(e) =>
								dispatch({
									type: "setString",
									field: "note",
									value: e.target.value,
								})
							}
							placeholder="Special instructions or payment context shown on the receipt"
							rows={2}
						/>
						<p className="mt-1 text-xs text-muted-foreground">
							Visible on the customer receipt.
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={submit}
						disabled={isPending || (!isEdit && !selectedCustomerId)}
					>
						{submitLabel()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
