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
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreatePayment, useNoteCategories } from "../hooks/use-billing";
import { customerMonthlyDue } from "../lib/billing-utils";
import type { UnpaidCustomer } from "./CustomerCard";

interface PaymentSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customer: UnpaidCustomer | null;
}

/**
 * Normalize a phone number to +961XXXXXXXX format for the phone input.
 * Handles raw digits like "70442737" → "+96170442737"
 */
function toInternationalPhone(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	if (digits.startsWith("961")) {
		return `+${digits}`;
	}
	if (digits.startsWith("0")) {
		return `+961${digits.slice(1)}`;
	}
	if (digits.length <= 8) {
		return `+961${digits}`;
	}
	return `+${digits}`;
}

/**
 * Strip all non-digit chars except leading +, remove spaces.
 * Result: "+96170442737"
 */
function stripPhone(phone: string): string {
	const cleaned = phone.replace(/[\s\-()]/g, "");
	if (cleaned.startsWith("+")) {
		return `+${cleaned.slice(1).replace(/\D/g, "")}`;
	}
	return cleaned.replace(/\D/g, "");
}

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

	const accountPrice =
		customer?.monthlyRate ?? customer?.plan?.monthlyPrice ?? 0;
	const iptvPrice = customer?.iptvPrice ?? 0;
	const realIpPrice = customer?.realIpPrice ?? 0;
	const discountAmount = customer?.discount ?? 0;

	const [paidAmount, setPaidAmount] = useState("");
	const [freeAccount, setFreeAccount] = useState(false);
	const [stoppedAccount, setStoppedAccount] = useState(false);
	const [noteCategory, setNoteCategory] = useState("");
	const [notes, setNotes] = useState("");
	const [customerMobile, setCustomerMobile] = useState("");
	// Reset form when a different customer is selected
	const customerId = customer?.id;

	// biome-ignore lint/correctness/useExhaustiveDependencies: only reset form when a different customer is selected
	useEffect(() => {
		if (customerId && customer) {
			const amount =
				customer.accumulatedDue ?? customerMonthlyDue(customer);
			setPaidAmount(String(amount));
			setFreeAccount(false);
			setStoppedAccount(false);
			setNoteCategory("");
			setNotes("");
			const rawPhone = customer?.mobile ?? customer?.phone ?? "";
			setCustomerMobile(rawPhone ? toInternationalPhone(rawPhone) : "");
		}
	}, [customerId]);

	const monthlyDue = customer ? customerMonthlyDue(customer) : 0;
	const unpaidMonths = customer?.unpaidMonths ?? 1;
	const pastDueMonths = customer?.pastDueMonths ?? 0;
	const totalDue = freeAccount
		? (iptvPrice + realIpPrice) * unpaidMonths
		: customer
			? (customer.accumulatedDue ?? monthlyDue)
			: 0;

	const stoppedMissingNote = stoppedAccount && !noteCategory && !notes.trim();

	const amountNum = Number.parseFloat(paidAmount) || 0;
	const isAmountMismatch =
		Math.abs(amountNum - totalDue) >= 0.01 &&
		!stoppedAccount &&
		amountNum > 0;
	const mismatchMissingNote =
		isAmountMismatch && !noteCategory && !notes.trim();

	function doSubmit() {
		const collectorId = employee?.id ?? customer?.collector?.id;
		if (!organizationId || !collectorId || !customer) {
			return;
		}

		const originalMobile = customer.mobile ?? customer.phone;
		const cleanedMobile = stripPhone(customerMobile);
		const originalCleaned = originalMobile
			? stripPhone(toInternationalPhone(originalMobile))
			: "";
		const mobileChanged =
			cleanedMobile && cleanedMobile !== originalCleaned;

		createPayment.mutate(
			{
				organizationId,
				customerId: customer.id,
				collectorId,
				accountPrice,
				paidAmount: Number.parseFloat(paidAmount) || 0,
				discount: discountAmount,
				freeAccount,
				stoppedAccount,
				noteCategory: noteCategory || undefined,
				notes: notes || undefined,
				customerMobile: mobileChanged ? cleanedMobile : undefined,
			},
			{
				onSuccess: (data) => {
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
					toast.error(error.message);
				},
			},
		);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const amount = Number.parseFloat(paidAmount) || 0;
		confirm({
			title: `Collect ${formatCurrency(amount)}?`,
			message: `From ${name}. This cannot be undone.`,
			confirmLabel: "Confirm Payment",
			onConfirm: () => doSubmit(),
		});
	}

	if (!customer) {
		return null;
	}

	const name = displayName(customer.firstName, customer.lastName);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="bottom" className="overflow-y-auto">
				<SheetHeader className="pb-2">
					<SheetTitle className="text-left">
						Record Payment
					</SheetTitle>
				</SheetHeader>

				<form onSubmit={handleSubmit} className="space-y-4 pb-6">
					{/* Customer summary */}
					<div className="rounded-lg bg-muted/50 p-3 space-y-2">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-base font-semibold">
									{name}
								</p>
							</div>
							<div className="text-right">
								<p className="text-xs text-muted-foreground">
									Total due
								</p>
								<p className="text-xl font-bold tabular-nums">
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
										{pastDueMonths === 1
											? "month"
											: "months"}
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
									<span>Plan price</span>
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
									<div className="flex justify-between text-green-600 dark:text-green-400">
										<span>Discount</span>
										<span className="tabular-nums">
											-{formatCurrency(discountAmount)}
										</span>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Amount paid — large input */}
					<div>
						<Label htmlFor="sheet-paidAmount" className="text-base">
							Amount Paid
						</Label>
						<Input
							id="sheet-paidAmount"
							type="number"
							step="0.01"
							min="0"
							inputMode="decimal"
							value={paidAmount}
							onChange={(e) => setPaidAmount(e.target.value)}
							className="mt-1 h-14 text-2xl font-bold tabular-nums"
						/>
					</div>

					{/* Toggles — large touch targets */}
					<div className="flex gap-6">
						<label
							htmlFor="sheet-freeAccount"
							className="flex items-center gap-3 cursor-pointer"
						>
							<Switch
								id="sheet-freeAccount"
								checked={freeAccount}
								onCheckedChange={(checked) => {
									setFreeAccount(checked);
									// Recalculate paid amount (accounting for accumulated months)
									const perMonth = checked
										? iptvPrice + realIpPrice
										: accountPrice +
											iptvPrice +
											realIpPrice -
											discountAmount;
									setPaidAmount(
										String(perMonth * unpaidMonths),
									);
								}}
							/>
							<span className="text-sm font-medium">
								Free Account
							</span>
						</label>
						<label
							htmlFor="sheet-stoppedAccount"
							className="flex items-center gap-3 cursor-pointer"
						>
							<Switch
								id="sheet-stoppedAccount"
								checked={stoppedAccount}
								onCheckedChange={setStoppedAccount}
							/>
							<span className="text-sm font-medium">Stopped</span>
						</label>
					</div>

					{/* Phone number with country code */}
					<div>
						<Label>Customer Phone</Label>
						<PhoneInput
							defaultCountry="lb"
							value={customerMobile}
							onChange={(phone) => setCustomerMobile(phone)}
							inputClassName="!h-9 !text-sm !w-full !rounded-md !border-input !bg-transparent !shadow-xs"
							countrySelectorStyleProps={{
								buttonClassName:
									"!h-9 !rounded-l-md !border-input !bg-transparent !shadow-xs !px-2",
							}}
							className="mt-1"
							placeholder="Phone number"
						/>
					</div>

					{/* Note category */}
					<div>
						<Label>Note Category</Label>
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

					{/* Notes */}
					<div>
						<Label htmlFor="sheet-notes">Notes</Label>
						<Textarea
							id="sheet-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Optional note..."
							rows={2}
							className="mt-1"
						/>
					</div>

					{stoppedMissingNote && (
						<p className="text-sm font-medium text-destructive">
							Note required for stopped accounts
						</p>
					)}

					{mismatchMissingNote && (
						<p className="text-sm font-medium text-destructive">
							Note required when amount differs from total due
						</p>
					)}

					<Button
						type="submit"
						size="lg"
						className="w-full text-base font-semibold bg-green-600 hover:bg-green-700"
						disabled={
							createPayment.isPending ||
							stoppedMissingNote ||
							mismatchMissingNote
						}
					>
						{createPayment.isPending
							? "Recording..."
							: `Record Payment — ${formatCurrency(Number.parseFloat(paidAmount) || 0)}`}
					</Button>
				</form>
			</SheetContent>
		</Sheet>
	);
}
