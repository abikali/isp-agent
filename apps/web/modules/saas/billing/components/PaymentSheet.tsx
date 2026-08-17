"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { useConfirmationAlert } from "@saas/shared/client";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PhoneInput } from "@ui/components/phone-input";
import {
	isValidPhone,
	stripPhone,
	toInternationalPhone,
} from "@ui/components/phone-input-utils";
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
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Switch } from "@ui/components/switch";
import { Textarea } from "@ui/components/textarea";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useCreateBillingLocationRequest,
	useCreatePayment,
	useNoteCategories,
	useNotifyLocationNeeded,
} from "../hooks/use-billing";
import {
	calculateTotalDue,
	customerMonthlyDue,
	extractPriceComponents,
	parseAmount,
} from "../lib/billing-utils";
import type { UnpaidCustomer } from "./CustomerCard";
import { LocationPromptDialog } from "./LocationPromptDialog";

interface PaymentSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customer: UnpaidCustomer | null;
}

const MAX_PHONES = 5;

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive payment-collection sheet; shared form state and data flow make splitting obscure rather than clearer
export function PaymentSheet({
	open,
	onOpenChange,
	customer,
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field state slices (amount, toggles, phones, notes); a reducer adds indirection without grouping related transitions
}: PaymentSheetProps) {
	const organizationId = useOrganizationId();
	const { employee } = useActiveOrganization();
	const createPayment = useCreatePayment();
	const notifyLocation = useNotifyLocationNeeded();
	const createLocationRequest = useCreateBillingLocationRequest();
	const { confirm } = useConfirmationAlert();
	const { data: noteCategoriesData } = useNoteCategories();
	const noteCategories = noteCategoriesData?.categories ?? [];

	const { accountPrice, iptvPrice, realIpPrice, discountAmount } =
		extractPriceComponents(customer);

	// Form state is initialized once from the selected customer. The parent
	// remounts this component via `key={customer.id}`, so switching customers
	// re-runs these initializers with fresh values instead of an effect reset.
	const [paidAmount, setPaidAmount] = useState(() =>
		customer
			? String(calculateTotalDue(customer, { freeAccount: false }))
			: "",
	);
	const [freeAccount, setFreeAccount] = useState(false);
	const [referredCustomer, setReferredCustomer] = useState<{
		id: string;
		name: string;
		username: string | null;
	} | null>(null);
	const [stoppedAccount, setStoppedAccount] = useState(false);
	// "Dein": zero-cash visit — the customer still owes and promised to pay.
	const [debtAccount, setDebtAccount] = useState(false);
	const [noteCategory, setNoteCategory] = useState("");
	const [notes, setNotes] = useState("");
	const [phones, setPhones] = useState<
		Array<{ id: number; number: string; primary: boolean }>
	>(() => {
		// Initialize phones from customer.phones array (or fallback to mobile/phone)
		if (!customer) {
			return [{ id: 0, number: "", primary: true }];
		}
		const parsed = Array.isArray(customer.phones)
			? customer.phones.map(
					(p: { number: string; primary: boolean }, i) => ({
						id: i,
						number: toInternationalPhone(p.number),
						primary: p.primary,
					}),
				)
			: [customer.mobile, customer.phone].filter(Boolean).map((p, i) => ({
					id: i,
					number: toInternationalPhone(p as string),
					primary: i === 0,
				}));
		return parsed.length > 0
			? parsed
			: [{ id: 0, number: "", primary: true }];
	});

	const monthlyDue = customer ? customerMonthlyDue(customer) : 0;
	const pastDueMonths = customer?.pastDueMonths ?? 0;
	// Frozen invoice amounts from the unpaid list — the current monthlyRate can
	// differ from what old months were billed at, and the active month may
	// already be settled (old-debt cleanup).
	const pastDueAmount = customer?.pastDueAmount ?? pastDueMonths * monthlyDue;
	const currentMonthDue =
		customer?.accumulatedDue != null
			? customer.accumulatedDue - pastDueAmount
			: monthlyDue;
	const totalDue = customer
		? calculateTotalDue(customer, { freeAccount })
		: 0;

	const missingNote = !noteCategory && !notes.trim();
	const stoppedMissingNote = stoppedAccount && missingNote;
	const freeMissingNote = freeAccount && missingNote;
	const debtMissingNote = debtAccount && missingNote;

	const amountNum = parseAmount(paidAmount);
	const isAmountMismatch =
		Math.abs(amountNum - totalDue) >= 0.01 &&
		!stoppedAccount &&
		amountNum > 0;
	const mismatchMissingNote = isAmountMismatch && missingNote;
	const zeroAmountWithoutFlag =
		amountNum === 0 && !freeAccount && !stoppedAccount && !debtAccount;

	const hasValidPhone = phones.some((p) => isValidPhone(p.number));

	function updatePhone(index: number, value: string) {
		setPhones((prev) =>
			prev.map((p, i) => (i === index ? { ...p, number: value } : p)),
		);
	}

	function addPhone() {
		if (phones.length < MAX_PHONES) {
			setPhones((prev) => {
				// Ids only need to be unique within the current list; max+1
				// keeps the updater pure (no external counter mutation).
				const nextId =
					prev.reduce((max, p) => Math.max(max, p.id), -1) + 1;
				return [...prev, { id: nextId, number: "", primary: false }];
			});
		}
	}

	function removePhone(index: number) {
		if (phones.length > 1) {
			setPhones((prev) => {
				const updated = prev.filter((_, i) => i !== index);
				if (prev[index]?.primary && updated.length > 0) {
					return updated.map((p, i) =>
						i === 0 ? { ...p, primary: true } : p,
					);
				}
				return updated;
			});
		}
	}

	function setPrimary(index: number) {
		setPhones((prev) =>
			prev.map((p, i) => ({ ...p, primary: i === index })),
		);
	}

	const [showLocationPrompt, setShowLocationPrompt] = useState(false);

	const hasLocation = customer?.latitude && customer?.longitude;

	function doSubmit(location?: { latitude: number; longitude: number }) {
		const collectorId = employee?.id ?? customer?.collector?.id;
		if (!organizationId || !collectorId || !customer) {
			return;
		}

		// Build phones array with stripped numbers (single pass)
		const customerPhones = phones.flatMap((p) => {
			const number = stripPhone(p.number);
			return number !== "" ? [{ number, primary: p.primary }] : [];
		});

		createPayment.mutate(
			{
				organizationId,
				customerId: customer.id,
				collectorId,
				accountPrice,
				paidAmount: parseAmount(paidAmount),
				discount: discountAmount,
				freeAccount,
				stoppedAccount,
				debtAccount,
				noteCategory: noteCategory || undefined,
				notes: notes || undefined,
				customerPhones:
					customerPhones.length > 0 ? customerPhones : undefined,
				customerLatitude: location?.latitude,
				customerLongitude: location?.longitude,
				referredCustomerId:
					freeAccount && referredCustomer
						? referredCustomer.id
						: undefined,
			},
			{
				onSuccess: (data) => {
					setShowLocationPrompt(false);
					const receiptSent =
						"receiptSent" in data && !!data.receiptSent;
					toast.success(
						receiptSent
							? "Payment recorded — receipt sent via WhatsApp"
							: "Payment recorded",
					);
					onOpenChange(false);
				},
				onError: (error) => {
					setShowLocationPrompt(false);
					toast.error(error.message);
				},
			},
		);
	}

	function handleAfterConfirm() {
		if (!hasLocation) {
			setShowLocationPrompt(true);
		} else {
			doSubmit();
		}
	}

	const name = displayName(customer?.firstName, customer?.lastName);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const amount = parseAmount(paidAmount);
		confirm({
			title: stoppedAccount
				? "Stop account?"
				: debtAccount
					? "Record debt?"
					: `Collect ${formatCurrency(amount)}?`,
			message: stoppedAccount
				? `Mark ${name} as stopped. This cannot be undone.`
				: debtAccount
					? `Record that ${name} still owes — nothing collected. The month stays due.`
					: `From ${name}. This cannot be undone.`,
			confirmLabel: stoppedAccount
				? "Confirm Stop"
				: debtAccount
					? "Confirm Debt"
					: "Confirm Payment",
			onConfirm: () => handleAfterConfirm(),
		});
	}

	if (!customer) {
		return null;
	}

	return (
		<>
			<LocationPromptDialog
				key={String(showLocationPrompt)}
				open={showLocationPrompt}
				customerName={name}
				onConfirm={(latitude, longitude) => {
					doSubmit({ latitude, longitude });
				}}
				whatsappPending={createLocationRequest.isPending}
				onSendWhatsapp={() => {
					if (!organizationId || !customer) {
						return;
					}
					createLocationRequest.mutate(
						{
							organizationId,
							customerId: customer.id,
						},
						{
							onSuccess: (data) => {
								if (data.whatsappSent) {
									toast.success(
										"Location request sent to customer on WhatsApp",
									);
								} else {
									toast.warning(
										"Location request created, but WhatsApp delivery failed",
									);
								}
								doSubmit();
							},
							onError: (error) => {
								toast.error(error.message);
							},
						},
					);
				}}
				onSkip={() => {
					const collectorId = employee?.id ?? customer?.collector?.id;
					if (organizationId && customer && collectorId) {
						notifyLocation.mutate(
							{
								organizationId,
								customerId: customer.id,
								employeeId: collectorId,
							},
							{
								onSuccess: (data) => {
									if (data.reason === "no-telegram") {
										toast.error(
											"Your account has no Telegram ID configured. Ask an admin to set it up.",
										);
									}
								},
							},
						);
					}
					doSubmit();
				}}
			/>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent
					side="bottom"
					className="overflow-y-auto p-4 pt-3"
					onOpenAutoFocus={(e) => e.preventDefault()}
				>
					<SheetHeader className="pb-0">
						<SheetTitle className="text-left text-base">
							Record Payment
						</SheetTitle>
					</SheetHeader>

					<form onSubmit={handleSubmit} className="space-y-4 pb-4">
						{/* Customer summary */}
						<div className="rounded-lg bg-muted/50 p-3 space-y-2">
							<div className="flex items-center justify-between">
								<p className="text-sm font-semibold">{name}</p>
								<div className="text-right">
									<p className="text-xs text-destructive/70 leading-none">
										Total due
									</p>
									<p className="text-xl font-bold tabular-nums text-destructive">
										{formatCurrency(totalDue)}
									</p>
								</div>
							</div>
							{/* Past due breakdown */}
							{pastDueMonths > 0 && (
								<div className="border-t pt-2 space-y-0.5 text-xs">
									<div className="flex justify-between text-destructive font-medium">
										<span>
											Past due ({pastDueMonths}{" "}
											{pastDueMonths === 1 ? "mo" : "mos"}
											)
										</span>
										<span className="tabular-nums">
											{formatCurrency(pastDueAmount)}
										</span>
									</div>
									<div className="flex justify-between text-muted-foreground">
										<span>This month</span>
										{currentMonthDue > 0.001 ? (
											<span className="tabular-nums">
												{formatCurrency(
													currentMonthDue,
												)}
											</span>
										) : (
											<span className="text-success">
												Settled
											</span>
										)}
									</div>
								</div>
							)}
							{/* Price breakdown */}
							{(discountAmount > 0 ||
								iptvPrice > 0 ||
								realIpPrice > 0) && (
								<div className="border-t pt-2 space-y-0.5 text-xs text-muted-foreground">
									<div className="flex justify-between">
										<span>Plan</span>
										<span className="tabular-nums">
											{formatCurrency(accountPrice)}
										</span>
									</div>
									{iptvPrice > 0 && (
										<div className="flex justify-between">
											<span>IPTV</span>
											<span className="tabular-nums">
												+{formatCurrency(iptvPrice)}
											</span>
										</div>
									)}
									{realIpPrice > 0 && (
										<div className="flex justify-between">
											<span>Real IP</span>
											<span className="tabular-nums">
												+{formatCurrency(realIpPrice)}
											</span>
										</div>
									)}
									{discountAmount > 0 && (
										<div className="flex justify-between text-success">
											<span>Discount</span>
											<span className="tabular-nums">
												-
												{formatCurrency(discountAmount)}
											</span>
										</div>
									)}
								</div>
							)}
						</div>

						{/* Amount paid + toggles */}
						<div className="space-y-3">
							<div>
								<Label htmlFor="sheet-paidAmount">
									Amount Paid
								</Label>
								<Input
									id="sheet-paidAmount"
									type="number"
									step="0.01"
									min="0"
									inputMode="decimal"
									value={paidAmount}
									disabled={debtAccount}
									onChange={(e) =>
										setPaidAmount(e.target.value)
									}
									className="mt-1 h-11 text-xl font-bold tabular-nums"
								/>
							</div>
							<div className="flex items-center gap-4">
								<label
									htmlFor="sheet-freeAccount"
									className="flex items-center gap-2 cursor-pointer"
								>
									<Switch
										id="sheet-freeAccount"
										checked={freeAccount}
										disabled={stoppedAccount || debtAccount}
										onCheckedChange={(checked) => {
											setFreeAccount(checked);
											if (!checked) {
												setReferredCustomer(null);
											}
											if (customer) {
												setPaidAmount(
													String(
														calculateTotalDue(
															customer,
															{
																freeAccount:
																	checked,
															},
														),
													),
												);
											}
										}}
									/>
									<span className="text-sm">Free</span>
								</label>
								<label
									htmlFor="sheet-stoppedAccount"
									className="flex items-center gap-2 cursor-pointer"
								>
									<Switch
										id="sheet-stoppedAccount"
										checked={stoppedAccount}
										disabled={freeAccount || debtAccount}
										onCheckedChange={(checked) => {
											setStoppedAccount(checked);
											if (checked) {
												setPaidAmount("0");
											} else if (customer) {
												setPaidAmount(
													String(
														calculateTotalDue(
															customer,
															{
																freeAccount,
															},
														),
													),
												);
											}
										}}
									/>
									<span className="text-sm">Stopped</span>
								</label>
								<label
									htmlFor="sheet-debtAccount"
									className="flex items-center gap-2 cursor-pointer"
								>
									<Switch
										id="sheet-debtAccount"
										checked={debtAccount}
										disabled={freeAccount || stoppedAccount}
										onCheckedChange={(checked) => {
											setDebtAccount(checked);
											if (checked) {
												setPaidAmount("0");
											} else if (customer) {
												setPaidAmount(
													String(
														calculateTotalDue(
															customer,
															{
																freeAccount,
															},
														),
													),
												);
											}
										}}
									/>
									<span className="text-sm">Debt</span>
								</label>
							</div>
							{freeAccount && (
								<div className="mt-3">
									<Label
										htmlFor="referred-customer"
										className="mb-1.5 block text-xs font-medium"
									>
										Referred by{" "}
										<span className="text-muted-foreground">
											(optional)
										</span>
									</Label>
									<CustomerCombobox
										value={referredCustomer}
										onChange={setReferredCustomer}
										excludeCustomerId={customer?.id}
										placeholder="Search customer who referred…"
									/>
								</div>
							)}
						</div>

						{/* Phone numbers */}
						<div className="space-y-2">
							<Label>
								Phone{" "}
								<span className="text-destructive">*</span>
							</Label>
							{phones.map((phone, index) => {
								const hasValue =
									stripPhone(phone.number).length > 0;
								const invalid =
									hasValue && !isValidPhone(phone.number);
								return (
									<div key={phone.id} className="space-y-1">
										<div className="flex items-center gap-1.5">
											<PhoneInput
												value={phone.number}
												onChange={(val) =>
													updatePhone(index, val)
												}
												className="flex-1 min-w-0"
												aria-invalid={
													invalid || undefined
												}
											/>
											<Button
												type="button"
												variant={
													phone.primary
														? "primary"
														: "outline"
												}
												size="sm"
												className="shrink-0 h-9 text-xs px-2"
												title={
													phone.primary
														? "Primary number"
														: "Set as primary"
												}
												onClick={() =>
													setPrimary(index)
												}
											>
												{phone.primary
													? "Primary"
													: "Set primary"}
											</Button>
											{phones.length > 1 && (
												<Button
													type="button"
													variant="outline"
													size="icon"
													className="shrink-0 size-9 text-destructive border-destructive/30 hover:bg-destructive/10"
													onClick={() =>
														removePhone(index)
													}
												>
													<XIcon className="size-4" />
												</Button>
											)}
										</div>
										{invalid && (
											<p className="text-xs text-destructive">
												Invalid phone number
											</p>
										)}
									</div>
								);
							})}
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
							{!hasValidPhone && (
								<p className="text-xs text-destructive">
									At least one phone number is required
								</p>
							)}
						</div>

						{/* Category */}
						<div>
							<Label>Category</Label>
							<Select
								value={noteCategory}
								onValueChange={setNoteCategory}
							>
								<SelectTrigger className="mt-1">
									<SelectValue placeholder="Optional" />
								</SelectTrigger>
								<SelectContent>
									{noteCategories.map((cat) => (
										<SelectItem
											key={cat.value}
											value={cat.value}
										>
											{cat.labelAr
												? `${cat.label} (${cat.labelAr})`
												: cat.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Notes — full width */}
						<div>
							<Label htmlFor="sheet-notes">Notes</Label>
							<Textarea
								id="sheet-notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Optional..."
								rows={2}
								className="mt-1 resize-none"
							/>
						</div>

						{stoppedMissingNote && (
							<p className="text-xs font-medium text-destructive">
								Note required for stopped accounts
							</p>
						)}

						{freeMissingNote && (
							<p className="text-xs font-medium text-destructive">
								Note required for free accounts
							</p>
						)}

						{debtMissingNote && (
							<p className="text-xs font-medium text-destructive">
								Note required when recording a debt
							</p>
						)}

						{mismatchMissingNote && (
							<p className="text-xs font-medium text-destructive">
								Note required when amount differs from total due
							</p>
						)}

						{zeroAmountWithoutFlag && (
							<p className="text-xs font-medium text-destructive">
								Mark the payment as Free, Stopped, or Debt if no
								cash was collected
							</p>
						)}

						<Button
							type="submit"
							size="lg"
							className="w-full text-base font-semibold bg-success hover:bg-success/90 text-success-foreground shadow-sm"
							disabled={
								createPayment.isPending ||
								stoppedMissingNote ||
								freeMissingNote ||
								debtMissingNote ||
								mismatchMissingNote ||
								zeroAmountWithoutFlag ||
								!hasValidPhone
							}
						>
							{createPayment.isPending
								? "Recording..."
								: debtAccount
									? "Record Debt"
									: `Record Payment — ${formatCurrency(parseAmount(paidAmount))}`}
						</Button>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
