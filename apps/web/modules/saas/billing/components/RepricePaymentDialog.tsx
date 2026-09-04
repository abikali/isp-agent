"use client";

import {
	usePlansQuery,
	usePreviewAccountTypeChange,
} from "@saas/customers/client";
import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
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
import { CheckCircle2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRepriceAndReview } from "../hooks/use-billing";
import { NOTE_CATEGORY_LABELS, parseAmount } from "../lib/billing-utils";

export interface RepricePaymentTarget {
	id: string;
	customerId: string;
	customerName: string;
	externalId: string | null;
	currentPlanId: string | null;
	currentPlanName: string | null;
	/** Plan price and discount the collection was recorded against. */
	accountPrice: number;
	recordedDiscount: number;
	paidAmount: number;
	/**
	 * The customer's current standing prices — the form starts from these.
	 * The discount can already differ from `recordedDiscount` when an admin
	 * set it on the customer after the collection; the month still needs
	 * repricing then, so "changed" is measured against the recorded value.
	 */
	discount: number;
	iptvPrice: number;
	realIpPrice: number;
	noteCategory: string | null;
}

interface RepricePaymentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	payment: RepricePaymentTarget;
}

type PreviewData = Awaited<
	ReturnType<ReturnType<typeof usePreviewAccountTypeChange>["mutateAsync"]>
>;

const KEEP_PLAN = "__keep__";

/**
 * "Adjust pricing & review": the collector took a price the customer agreed
 * at the door — a different plan, a discount, a dropped add-on. The admin
 * confirms that pricing here; the customer, this payment and its month's
 * invoice are all repriced to it and the payment is marked reviewed.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single-dialog reprice flow; form, preview and result share state
export function RepricePaymentDialog({
	open,
	onOpenChange,
	organizationId,
	payment,
}: RepricePaymentDialogProps) {
	const { plans, isLoading: plansLoading } = usePlansQuery();
	const preview = usePreviewAccountTypeChange();
	const reprice = useRepriceAndReview();

	const [planId, setPlanId] = useState(KEEP_PLAN);
	const [discount, setDiscount] = useState(String(payment.discount));
	const [iptvPrice, setIptvPrice] = useState(String(payment.iptvPrice));
	const [realIpPrice, setRealIpPrice] = useState(String(payment.realIpPrice));
	const [previewData, setPreviewData] = useState<PreviewData | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [result, setResult] = useState<Awaited<
		ReturnType<typeof reprice.mutateAsync>
	> | null>(null);

	const planChanged =
		planId !== KEEP_PLAN && planId !== payment.currentPlanId;
	const selectedPlan = planChanged
		? plans.find((p) => p.id === planId)
		: undefined;
	// Plans priced at exactly what the collector took go first — that is
	// almost always the plan the customer asked for.
	const matchesPaid = (p: { monthlyPrice: number | null }) =>
		p.monthlyPrice != null &&
		Math.abs(p.monthlyPrice - payment.paidAmount) < 0.01;
	const selectablePlans = plans
		.filter((p) => p.externalId && p.id !== payment.currentPlanId)
		.sort((a, b) => Number(matchesPaid(b)) - Number(matchesPaid(a)));

	// Client-side estimate; the server prices a new plan from the dealer's
	// selling price, so the confirmed figures come back from the mutation.
	const basePrice = selectedPlan?.monthlyPrice ?? payment.accountPrice;
	const discountNum = parseAmount(discount);
	const iptvNum = parseAmount(iptvPrice);
	const realIpNum = parseAmount(realIpPrice);
	const addons = iptvNum + realIpNum;
	const newTotal = Math.max(0, basePrice + addons - discountNum);
	const remaining = newTotal - payment.paidAmount;
	const discountToMatch = Math.max(
		0,
		basePrice + addons - payment.paidAmount,
	);

	const changed =
		planChanged ||
		Math.abs(discountNum - payment.recordedDiscount) > 0.001 ||
		Math.abs(iptvNum - payment.iptvPrice) > 0.001 ||
		Math.abs(realIpNum - payment.realIpPrice) > 0.001;
	const invalid = [discount, iptvPrice, realIpPrice].some((v) => {
		const n = Number.parseFloat(v);
		return !Number.isFinite(n) || n < 0;
	});
	const busy = preview.isPending || reprice.isPending;

	function handleOpenChange(next: boolean) {
		if (!next) {
			setPlanId(KEEP_PLAN);
			setDiscount(String(payment.discount));
			setIptvPrice(String(payment.iptvPrice));
			setRealIpPrice(String(payment.realIpPrice));
			setPreviewData(null);
			setConfirming(false);
			setResult(null);
		}
		onOpenChange(next);
	}

	async function handleContinue() {
		if (planChanged) {
			try {
				setPreviewData(
					await preview.mutateAsync({
						organizationId,
						customerId: payment.customerId,
						newPlanId: planId,
					}),
				);
			} catch (err) {
				toast.error(
					`Failed to preview plan change: ${err instanceof Error ? err.message : "Unknown error"}`,
				);
				return;
			}
		}
		setConfirming(true);
	}

	async function handleConfirm() {
		try {
			setResult(
				await reprice.mutateAsync({
					organizationId,
					paymentId: payment.id,
					...(planChanged ? { newPlanId: planId } : {}),
					...(Math.abs(discountNum - payment.recordedDiscount) > 0.001
						? { discount: discountNum }
						: {}),
					...(Math.abs(iptvNum - payment.iptvPrice) > 0.001
						? { iptvPrice: iptvNum }
						: {}),
					...(Math.abs(realIpNum - payment.realIpPrice) > 0.001
						? { realIpPrice: realIpNum }
						: {}),
				}),
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to reprice",
			);
		}
	}

	const categoryLabel = payment.noteCategory
		? (NOTE_CATEGORY_LABELS[payment.noteCategory] ?? payment.noteCategory)
		: null;

	if (result) {
		return (
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<div className="flex items-center gap-2">
							<CheckCircle2Icon className="size-5 text-green-600" />
							<DialogTitle>Pricing applied</DialogTitle>
						</div>
						<DialogDescription>
							The customer, this payment and its month were
							repriced and the payment marked reviewed.
						</DialogDescription>
					</DialogHeader>
					<div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
						{result.newPlan && (
							<>
								<span className="text-muted-foreground">
									New plan:
								</span>
								<span className="font-medium">
									{result.newPlan.name}
								</span>
								<span className="text-muted-foreground">
									MikroTik:
								</span>
								<span>
									{result.disconnected
										? "User disconnected (will reconnect with new plan)"
										: "User was not online"}
								</span>
							</>
						)}
						<span className="text-muted-foreground">
							Plan price:
						</span>
						<span>{formatCurrency(result.accountPrice)}</span>
						<span className="text-muted-foreground">Discount:</span>
						<span>{formatCurrency(result.discount)}</span>
						{(result.iptvPrice > 0 || result.realIpPrice > 0) && (
							<>
								<span className="text-muted-foreground">
									Add-ons:
								</span>
								<span>
									{formatCurrency(
										result.iptvPrice + result.realIpPrice,
									)}
								</span>
							</>
						)}
						<span className="text-muted-foreground">
							Month now due:
						</span>
						<span className="font-medium">
							{formatCurrency(result.invoiceTotal)}
						</span>
						<span className="text-muted-foreground">
							Still owed this month:
						</span>
						<span
							className={
								result.remaining > 0
									? "text-destructive"
									: "text-green-600"
							}
						>
							{formatCurrency(result.remaining)}
						</span>
					</div>
					<DialogFooter>
						<Button onClick={() => handleOpenChange(false)}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Adjust pricing & review</DialogTitle>
					<DialogDescription>
						{confirming
							? "Confirm the new pricing. The customer, this payment and its month's invoice will be repriced to it and the payment marked reviewed."
							: "Set the price the customer agreed to. The month is repriced to it, so the collection no longer shows a remainder."}
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
					<p className="font-medium">
						{payment.customerName} paid{" "}
						{formatCurrency(payment.paidAmount)} instead of{" "}
						{formatCurrency(
							payment.accountPrice +
								payment.iptvPrice +
								payment.realIpPrice -
								payment.recordedDiscount,
						)}
						{payment.currentPlanName
							? ` (${payment.currentPlanName})`
							: ""}
						.
					</p>
					{categoryLabel && (
						<p className="mt-1 text-muted-foreground">
							The collector marked this as{" "}
							{categoryLabel.toLowerCase()}.
						</p>
					)}
				</div>

				{!confirming ? (
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="reprice-plan">Plan</Label>
							<Combobox
								id="reprice-plan"
								value={planId}
								onChange={(v) => setPlanId(v || KEEP_PLAN)}
								options={[
									{
										value: KEEP_PLAN,
										label: `Keep current plan${payment.currentPlanName ? ` — ${payment.currentPlanName}` : ""}`,
									},
									...selectablePlans.map((p) => ({
										value: p.id,
										label:
											p.monthlyPrice != null
												? `${p.name} — ${formatCurrency(p.monthlyPrice)}${matchesPaid(p) ? " · matches amount paid" : ""}`
												: p.name,
									})),
								]}
								placeholder={
									plansLoading
										? "Loading plans..."
										: "Select a plan"
								}
								searchPlaceholder="Search plans…"
								emptyText="No matching plans"
								disabled={!payment.externalId}
							/>
						</div>
						<div className="grid grid-cols-3 gap-3">
							<div className="space-y-2">
								<Label htmlFor="reprice-discount">
									Discount
								</Label>
								<Input
									id="reprice-discount"
									type="number"
									step="0.01"
									min="0"
									value={discount}
									onChange={(e) =>
										setDiscount(e.target.value)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="reprice-iptv">IPTV</Label>
								<Input
									id="reprice-iptv"
									type="number"
									step="0.01"
									min="0"
									value={iptvPrice}
									onChange={(e) =>
										setIptvPrice(e.target.value)
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="reprice-realip">Real IP</Label>
								<Input
									id="reprice-realip"
									type="number"
									step="0.01"
									min="0"
									value={realIpPrice}
									onChange={(e) =>
										setRealIpPrice(e.target.value)
									}
								/>
							</div>
						</div>
						{Math.abs(remaining) > 0.01 && discountToMatch > 0 && (
							<Button
								type="button"
								variant="link"
								size="sm"
								className="h-auto p-0"
								onClick={() =>
									setDiscount(discountToMatch.toFixed(2))
								}
							>
								Set discount to{" "}
								{formatCurrency(discountToMatch)} so the amount
								paid covers the month
							</Button>
						)}
					</div>
				) : (
					<div className="space-y-3">
						{previewData && (
							<div className="rounded-lg border p-3 text-sm">
								<p className="mb-2 font-medium">
									Plan change:{" "}
									{previewData.oldAccountType.name} →{" "}
									{previewData.newAccountType.name}
								</p>
								<div className="grid grid-cols-2 gap-1">
									<span className="text-muted-foreground">
										Refund / Charge:
									</span>
									<span
										className={
											previewData.billing.refund < 0
												? "text-destructive"
												: "text-green-600"
										}
									>
										{formatCurrency(
											previewData.billing.refund,
										)}
									</span>
									<span className="text-muted-foreground">
										Dealer credit after:
									</span>
									<span>
										{formatCurrency(
											previewData.billing
												.dealerCreditAfter,
										)}
									</span>
									<span className="text-muted-foreground">
										Quota reset:
									</span>
									<span>
										{previewData.billing.quotaReset
											? "Yes"
											: "No"}
									</span>
								</div>
							</div>
						)}
						<div className="rounded-lg border p-3 text-sm">
							<div className="grid grid-cols-2 gap-1">
								<span className="text-muted-foreground">
									Discount:
								</span>
								<span>{formatCurrency(discountNum)}</span>
								<span className="text-muted-foreground">
									IPTV / Real IP:
								</span>
								<span>{formatCurrency(addons)}</span>
							</div>
						</div>
					</div>
				)}

				<div className="rounded-lg border p-3 text-sm">
					<div className="grid grid-cols-2 gap-1">
						<span className="text-muted-foreground">
							Month due{confirming ? "" : " (estimate)"}:
						</span>
						<span className="font-medium">
							{formatCurrency(newTotal)}
						</span>
						<span className="text-muted-foreground">Paid:</span>
						<span>{formatCurrency(payment.paidAmount)}</span>
						<span className="text-muted-foreground">
							{remaining > 0.01 ? "Still owed:" : "Difference:"}
						</span>
						<span
							className={
								remaining > 0.01
									? "text-destructive"
									: "text-green-600"
							}
						>
							{formatCurrency(Math.abs(remaining))}
						</span>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() =>
							confirming
								? setConfirming(false)
								: handleOpenChange(false)
						}
						disabled={busy}
					>
						{confirming ? "Back" : "Cancel"}
					</Button>
					{!confirming ? (
						<Button
							onClick={handleContinue}
							disabled={!changed || invalid || busy}
						>
							{preview.isPending ? "Loading..." : "Continue"}
						</Button>
					) : (
						<Button onClick={handleConfirm} disabled={busy}>
							{reprice.isPending
								? "Applying..."
								: "Apply & mark reviewed"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
