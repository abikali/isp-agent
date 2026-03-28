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
import { CheckCircleIcon, MessageCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCreatePayment } from "../hooks/use-billing";
import { formatWhatsAppReceiptLink } from "../lib/whatsapp";
import type { UnpaidCustomer } from "./CustomerCard";

interface PaymentSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customer: UnpaidCustomer | null;
}

const NOTE_CATEGORIES = [
	{ value: "DOWNGRADE", label: "Downgrade (تصغير)" },
	{ value: "UPGRADE", label: "Upgrade (تكبير)" },
	{ value: "DISCOUNT", label: "Discount (خصم)" },
	{ value: "REFERRAL", label: "Referral (احضر صديق)" },
	{ value: "MOVED", label: "Moved (انتقل)" },
	{ value: "POOR_SERVICE", label: "Poor Service (انترنت غير جيد)" },
	{ value: "CANT_PAY", label: "Can't Pay (لا يستطيع الدفع)" },
	{ value: "TEMP_STOP", label: "Temp Stop (توقيف مؤقت)" },
] as const;

export function PaymentSheet({
	open,
	onOpenChange,
	customer,
}: PaymentSheetProps) {
	const organizationId = useOrganizationId();
	const { employee } = useActiveOrganization();
	const createPayment = useCreatePayment();
	const { confirm } = useConfirmationAlert();

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
	const [showReceiptPrompt, setShowReceiptPrompt] = useState(false);
	const [lastPaymentInfo, setLastPaymentInfo] = useState<{
		name: string;
		amount: number;
		phone: string | null;
		receiptSent: boolean;
	} | null>(null);

	// Reset form when a different customer is selected
	const customerId = customer?.id;

	// biome-ignore lint/correctness/useExhaustiveDependencies: only reset form when a different customer is selected
	useEffect(() => {
		if (customerId) {
			const total =
				accountPrice + iptvPrice + realIpPrice - discountAmount;
			setPaidAmount(String(total));
			setFreeAccount(false);
			setStoppedAccount(false);
			setNoteCategory("");
			setNotes("");
			setCustomerMobile(customer?.mobile ?? customer?.phone ?? "");
			setShowReceiptPrompt(false);
			setLastPaymentInfo(null);
		}
	}, [customerId]);

	const totalDue = freeAccount
		? iptvPrice + realIpPrice
		: accountPrice + iptvPrice + realIpPrice - discountAmount;

	const stoppedMissingNote = stoppedAccount && !noteCategory && !notes.trim();

	function doSubmit() {
		const collectorId = employee?.id ?? customer?.collector?.id;
		if (!organizationId || !collectorId || !customer) {
			return;
		}

		const originalMobile = customer.mobile ?? customer.phone;
		const mobileChanged =
			customerMobile && customerMobile !== originalMobile;

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
				noteCategory: noteCategory
					? (noteCategory as (typeof NOTE_CATEGORIES)[number]["value"])
					: undefined,
				notes: notes || undefined,
				customerMobile: mobileChanged ? customerMobile : undefined,
			},
			{
				onSuccess: (data) => {
					const cName = displayName(
						customer.firstName,
						customer.lastName,
					);
					const amount = Number.parseFloat(paidAmount) || 0;
					const phone = mobileChanged
						? customerMobile
						: originalMobile;
					const receiptSent =
						"receiptSent" in data && !!data.receiptSent;

					if (!stoppedAccount && phone) {
						setLastPaymentInfo({
							name: cName,
							amount,
							phone,
							receiptSent,
						});
						setShowReceiptPrompt(true);
					} else {
						toast.success("Payment recorded");
						onOpenChange(false);
					}
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

	function handleSendReceipt() {
		if (lastPaymentInfo) {
			const link = formatWhatsAppReceiptLink(
				lastPaymentInfo.phone,
				lastPaymentInfo.name,
				lastPaymentInfo.amount,
			);
			if (link) {
				window.open(link, "_blank");
			}
		}
		toast.success("Payment recorded");
		onOpenChange(false);
	}

	function handleSkipReceipt() {
		toast.success("Payment recorded");
		onOpenChange(false);
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
						{showReceiptPrompt
							? "Payment Recorded!"
							: "Record Payment"}
					</SheetTitle>
				</SheetHeader>

				{showReceiptPrompt ? (
					<div className="space-y-4 pb-6">
						<div className="flex flex-col items-center gap-3 py-4">
							<CheckCircleIcon className="size-12 text-green-500" />
							<p className="text-center text-lg font-medium">
								{formatCurrency(lastPaymentInfo?.amount ?? 0)}{" "}
								collected from {lastPaymentInfo?.name}
							</p>
							{lastPaymentInfo?.receiptSent && (
								<p className="text-sm text-green-600 font-medium">
									Receipt sent via WhatsApp
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							{lastPaymentInfo?.phone && (
								<Button
									size="lg"
									className="w-full text-base"
									onClick={handleSendReceipt}
								>
									<MessageCircleIcon className="mr-2 size-4" />
									{lastPaymentInfo.receiptSent
										? "Send Again via WhatsApp"
										: "Send Receipt via WhatsApp"}
								</Button>
							)}
							<Button
								size="lg"
								variant="outline"
								className="w-full text-base"
								onClick={handleSkipReceipt}
							>
								{lastPaymentInfo?.receiptSent ? "Done" : "Skip"}
							</Button>
						</div>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4 pb-6">
						{/* Customer summary */}
						<div className="rounded-lg bg-muted/50 p-3">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-base font-semibold">
										{name}
									</p>
									<p className="text-sm text-muted-foreground">
										{customer.plan?.name ?? "No plan"}
									</p>
								</div>
								<p className="text-xl font-bold tabular-nums">
									{formatCurrency(totalDue)}
								</p>
							</div>
						</div>

						{/* Amount paid — large input */}
						<div>
							<Label
								htmlFor="sheet-paidAmount"
								className="text-base"
							>
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
										// Recalculate paid amount
										const newTotal = checked
											? iptvPrice + realIpPrice
											: accountPrice +
												iptvPrice +
												realIpPrice -
												discountAmount;
										setPaidAmount(String(newTotal));
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
								<span className="text-sm font-medium">
									Stopped
								</span>
							</label>
						</div>

						{/* Phone number */}
						<div>
							<Label htmlFor="sheet-mobile">Customer Phone</Label>
							<Input
								id="sheet-mobile"
								type="tel"
								inputMode="tel"
								value={customerMobile}
								onChange={(e) =>
									setCustomerMobile(e.target.value)
								}
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
									{NOTE_CATEGORIES.map((cat) => (
										<SelectItem
											key={cat.value}
											value={cat.value}
										>
											{cat.label}
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

						<Button
							type="submit"
							size="lg"
							className="w-full text-base font-semibold bg-green-600 hover:bg-green-700"
							disabled={
								createPayment.isPending || stoppedMissingNote
							}
						>
							{createPayment.isPending
								? "Recording..."
								: `Record Payment — ${formatCurrency(Number.parseFloat(paidAmount) || 0)}`}
						</Button>
					</form>
				)}
			</SheetContent>
		</Sheet>
	);
}
