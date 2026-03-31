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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreatePayment, useNoteCategories } from "../hooks/use-billing";
import {
	calculateTotalDue,
	customerMonthlyDue,
	extractPriceComponents,
	parseAmount,
} from "../lib/billing-utils";
import type { UnpaidCustomer } from "./CustomerCard";

interface PaymentSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customer: UnpaidCustomer | null;
}

const MAX_PHONES = 2;

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
	const [phones, setPhones] = useState<string[]>([""]);
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
			// Initialize phones from customer.mobile and customer.phone
			const rawPhones = [customer.mobile, customer.phone]
				.filter(Boolean)
				.map((p) => toInternationalPhone(p as string));
			setPhones(rawPhones.length > 0 ? rawPhones : [""]);
		}
	}, [customerId]);

	const monthlyDue = customer ? customerMonthlyDue(customer) : 0;
	const pastDueMonths = customer?.pastDueMonths ?? 0;
	const totalDue = customer
		? calculateTotalDue(customer, { freeAccount })
		: 0;

	const stoppedMissingNote = stoppedAccount && !noteCategory && !notes.trim();

	const amountNum = parseAmount(paidAmount);
	const isAmountMismatch =
		Math.abs(amountNum - totalDue) >= 0.01 &&
		!stoppedAccount &&
		amountNum > 0;
	const mismatchMissingNote =
		isAmountMismatch && !noteCategory && !notes.trim();

	const hasValidPhone = phones.some((p) => isValidPhone(p));

	function updatePhone(index: number, value: string) {
		setPhones((prev) => prev.map((p, i) => (i === index ? value : p)));
	}

	function addPhone() {
		if (phones.length < MAX_PHONES) {
			setPhones((prev) => [...prev, ""]);
		}
	}

	function removePhone(index: number) {
		if (phones.length > 1) {
			setPhones((prev) => prev.filter((_, i) => i !== index));
		}
	}

	function doSubmit() {
		const collectorId = employee?.id ?? customer?.collector?.id;
		if (!organizationId || !collectorId || !customer) {
			return;
		}

		// Determine if mobile (phones[0]) changed
		const originalMobile = customer.mobile;
		const newMobile = stripPhone(phones[0] ?? "");
		const originalMobileCleaned = originalMobile
			? stripPhone(toInternationalPhone(originalMobile))
			: "";
		const mobileChanged = newMobile && newMobile !== originalMobileCleaned;

		// Determine if phone (phones[1]) changed
		const originalPhone = customer.phone;
		const newPhone = stripPhone(phones[1] ?? "");
		const originalPhoneCleaned = originalPhone
			? stripPhone(toInternationalPhone(originalPhone))
			: "";
		const phoneChanged = newPhone !== originalPhoneCleaned;

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
				customerMobile: mobileChanged ? newMobile : undefined,
				customerPhone: phoneChanged ? newPhone || null : undefined,
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
		const amount = parseAmount(paidAmount);
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
			<SheetContent
				side="bottom"
				className="overflow-y-auto p-4 pt-3 gap-2"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				<SheetHeader className="pb-0">
					<SheetTitle className="text-left text-base">
						Record Payment
					</SheetTitle>
				</SheetHeader>

				<form onSubmit={handleSubmit} className="space-y-3 pb-4">
					{/* Customer summary */}
					<div className="rounded-lg bg-muted/50 p-2.5 space-y-1.5">
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
							<div className="border-t pt-1.5 space-y-0.5 text-xs">
								<div className="flex justify-between text-destructive font-medium">
									<span>
										Past due ({pastDueMonths}{" "}
										{pastDueMonths === 1 ? "mo" : "mos"})
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
							<div className="border-t pt-1.5 space-y-0.5 text-xs text-muted-foreground">
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
											-{formatCurrency(discountAmount)}
										</span>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Amount paid */}
					<div>
						<Label htmlFor="sheet-paidAmount">Amount Paid</Label>
						<Input
							id="sheet-paidAmount"
							type="number"
							step="0.01"
							min="0"
							inputMode="decimal"
							value={paidAmount}
							onChange={(e) => setPaidAmount(e.target.value)}
							className="mt-1 h-11 text-xl font-bold tabular-nums"
						/>
					</div>

					{/* Toggles */}
					<div className="flex gap-5">
						<label
							htmlFor="sheet-freeAccount"
							className="flex items-center gap-2 cursor-pointer"
						>
							<Switch
								id="sheet-freeAccount"
								checked={freeAccount}
								onCheckedChange={(checked) => {
									setFreeAccount(checked);
									if (customer) {
										setPaidAmount(
											String(
												calculateTotalDue(customer, {
													freeAccount: checked,
												}),
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
								onCheckedChange={setStoppedAccount}
							/>
							<span className="text-sm">Stopped</span>
						</label>
					</div>

					{/* Phone numbers */}
					<div className="space-y-1.5">
						<Label>
							Phone <span className="text-destructive">*</span>
						</Label>
						{phones.map((phone, index) => (
							<div
								key={index}
								className="flex items-center gap-1"
							>
								<PhoneInput
									value={phone}
									onChange={(val) => updatePhone(index, val)}
									className="flex-1"
								/>
								{/* Show + on last row when under max, or X when multiple */}
								{phones.length > 1 ? (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="shrink-0 size-9 text-muted-foreground hover:text-destructive"
										onClick={() => removePhone(index)}
									>
										<XIcon className="size-4" />
									</Button>
								) : phones.length < MAX_PHONES ? (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="shrink-0 size-9 text-muted-foreground"
										onClick={addPhone}
									>
										<PlusIcon className="size-4" />
									</Button>
								) : null}
							</div>
						))}
						{/* When multiple phones, show + on last row */}
						{phones.length > 1 && phones.length < MAX_PHONES && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="text-muted-foreground h-7 text-xs"
								onClick={addPhone}
							>
								<PlusIcon className="size-3.5" />
								Add phone
							</Button>
						)}
						{!hasValidPhone && (
							<p className="text-xs text-destructive">
								At least one phone number is required
							</p>
						)}
					</div>

					{/* Note category + notes in a row */}
					<div className="grid grid-cols-2 gap-2">
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
						<div>
							<Label htmlFor="sheet-notes">Notes</Label>
							<Textarea
								id="sheet-notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Optional..."
								rows={1}
								className="mt-1 min-h-9 resize-none"
							/>
						</div>
					</div>

					{stoppedMissingNote && (
						<p className="text-xs font-medium text-destructive">
							Note required for stopped accounts
						</p>
					)}

					{mismatchMissingNote && (
						<p className="text-xs font-medium text-destructive">
							Note required when amount differs from total due
						</p>
					)}

					<Button
						type="submit"
						variant="ghost"
						size="lg"
						className="w-full text-base font-semibold bg-success hover:bg-success/90 text-success-foreground shadow-sm"
						disabled={
							createPayment.isPending ||
							stoppedMissingNote ||
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
	);
}
