"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { useConfirmationAlert } from "@saas/shared/client";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	isValidPhone,
	PhoneInput,
	stripPhone,
	toInternationalPhone,
} from "@ui/components/phone-input";
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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCreatePayment, useNoteCategories } from "../hooks/use-billing";
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

export function PaymentSheet({
	open,
	onOpenChange,
	customer,
}: PaymentSheetProps) {
	const organizationId = useOrganizationId();
	const { employee } = useActiveOrganization();
	const createPayment = useCreatePayment();
	const { confirm } = useConfirmationAlert();
	const { data: noteCategoriesData } = useNoteCategories();
	const noteCategories = noteCategoriesData?.categories ?? [];

	const { accountPrice, iptvPrice, realIpPrice, discountAmount } =
		extractPriceComponents(customer);

	const [paidAmount, setPaidAmount] = useState("");
	const [freeAccount, setFreeAccount] = useState(false);
	const [stoppedAccount, setStoppedAccount] = useState(false);
	const [noteCategory, setNoteCategory] = useState("");
	const [notes, setNotes] = useState("");
	const phoneIdRef = useRef(0);
	const [phones, setPhones] = useState<
		Array<{ id: number; number: string; primary: boolean }>
	>([{ id: 0, number: "", primary: true }]);
	// Reset form when a different customer is selected
	const customerId = customer?.id;

	// biome-ignore lint/correctness/useExhaustiveDependencies: only reset form when a different customer is selected
	useEffect(() => {
		if (customerId && customer) {
			const amount = calculateTotalDue(customer, { freeAccount: false });
			setPaidAmount(String(amount));
			setFreeAccount(false);
			setStoppedAccount(false);
			setNoteCategory("");
			setNotes("");
			// Initialize phones from customer.phones array (or fallback to mobile/phone)
			phoneIdRef.current = 0;
			const parsed = Array.isArray(customer.phones)
				? customer.phones.map(
						(p: { number: string; primary: boolean }) => ({
							id: phoneIdRef.current++,
							number: toInternationalPhone(p.number),
							primary: p.primary,
						}),
					)
				: [customer.mobile, customer.phone]
						.filter(Boolean)
						.map((p, i) => ({
							id: phoneIdRef.current++,
							number: toInternationalPhone(p as string),
							primary: i === 0,
						}));
			setPhones(
				parsed.length > 0
					? parsed
					: [{ id: phoneIdRef.current++, number: "", primary: true }],
			);
			setShowLocationPrompt(false);
		}
	}, [customerId]);

	const monthlyDue = customer ? customerMonthlyDue(customer) : 0;
	const pastDueMonths = customer?.pastDueMonths ?? 0;
	const totalDue = customer
		? calculateTotalDue(customer, { freeAccount })
		: 0;

	const missingNote = !noteCategory && !notes.trim();
	const stoppedMissingNote = stoppedAccount && missingNote;
	const freeMissingNote = freeAccount && missingNote;

	const amountNum = parseAmount(paidAmount);
	const isAmountMismatch =
		Math.abs(amountNum - totalDue) >= 0.01 &&
		!stoppedAccount &&
		amountNum > 0;
	const mismatchMissingNote = isAmountMismatch && missingNote;

	const hasValidPhone = phones.some((p) => isValidPhone(p.number));

	function updatePhone(index: number, value: string) {
		setPhones((prev) =>
			prev.map((p, i) => (i === index ? { ...p, number: value } : p)),
		);
	}

	function addPhone() {
		if (phones.length < MAX_PHONES) {
			setPhones((prev) => [
				...prev,
				{ id: ++phoneIdRef.current, number: "", primary: false },
			]);
		}
	}

	function removePhone(index: number) {
		if (phones.length > 1) {
			setPhones((prev) => {
				const updated = prev.filter((_, i) => i !== index);
				const first = updated[0];
				if (prev[index]?.primary && first) {
					updated[0] = { ...first, primary: true };
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

		// Build phones array with stripped numbers
		const customerPhones = phones
			.map((p) => ({
				number: stripPhone(p.number),
				primary: p.primary,
			}))
			.filter((p) => p.number !== "");

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
				noteCategory: noteCategory || undefined,
				notes: notes || undefined,
				customerPhones:
					customerPhones.length > 0 ? customerPhones : undefined,
				customerLatitude: location?.latitude,
				customerLongitude: location?.longitude,
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
				: `Collect ${formatCurrency(amount)}?`,
			message: stoppedAccount
				? `Mark ${name} as stopped. This cannot be undone.`
				: `From ${name}. This cannot be undone.`,
			confirmLabel: stoppedAccount ? "Confirm Stop" : "Confirm Payment",
			onConfirm: () => handleAfterConfirm(),
		});
	}

	if (!customer) {
		return null;
	}

	return (
		<>
			<LocationPromptDialog
				open={showLocationPrompt}
				customerName={name}
				onConfirm={(latitude, longitude) => {
					doSubmit({ latitude, longitude });
				}}
				onSkip={() => {
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
									<p className="text-[10px] text-muted-foreground leading-none">
										Total due
									</p>
									<p className="text-lg font-bold tabular-nums">
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
											{formatCurrency(
												pastDueMonths * monthlyDue,
											)}
										</span>
									</div>
									<div className="flex justify-between text-muted-foreground">
										<span>This month</span>
										<span className="tabular-nums">
											{formatCurrency(monthlyDue)}
										</span>
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

						{/* Amount paid + toggles row */}
						<div className="flex items-end gap-3">
							<div className="flex-1">
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
									onChange={(e) =>
										setPaidAmount(e.target.value)
									}
									disabled={stoppedAccount}
									className="mt-1 h-11 text-xl font-bold tabular-nums"
								/>
							</div>
							<div className="flex items-center gap-4 pb-1.5">
								<label
									htmlFor="sheet-freeAccount"
									className="flex items-center gap-2 cursor-pointer"
								>
									<Switch
										id="sheet-freeAccount"
										checked={freeAccount}
										disabled={stoppedAccount}
										onCheckedChange={(checked) => {
											setFreeAccount(checked);
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
										disabled={freeAccount}
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
							</div>
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

						{mismatchMissingNote && (
							<p className="text-xs font-medium text-destructive">
								Note required when amount differs from total due
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
								mismatchMissingNote ||
								!hasValidPhone
							}
						>
							{createPayment.isPending
								? "Recording..."
								: `Record Payment — ${formatCurrency(parseAmount(paidAmount))}`}
						</Button>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
