"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { useConfirmationAlert } from "@saas/shared/client";
import { displayName as getDisplayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
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
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { useState } from "react";
import { toast } from "sonner";
import {
	useCollectors,
	useCreatePayment,
	useNoteCategories,
} from "../hooks/use-billing";
import {
	calculateTotalDue,
	customerMonthlyDue,
	extractPriceComponents,
	parseAmount,
} from "../lib/billing-utils";
import { LENIENCY_NOTICE, leniencyReason } from "../lib/leniency-warning";

interface PaymentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customer: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		username?: string | null;
		mobile?: string | null;
		monthlyRate?: number | null;
		discount?: number | null;
		iptvPrice?: number | null;
		realIpPrice?: number | null;
		accumulatedDue?: number | null;
		unpaidMonths?: number | null;
		plan?: { name: string; monthlyPrice?: number | null } | null;
		collector?: { id: string; name: string } | null;
	};
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive payment dialog; shared form state and data flow make splitting obscure rather than clearer
export function PaymentDialog({
	open,
	onOpenChange,
	customer,
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field state slices; a reducer adds indirection without grouping related transitions
}: PaymentDialogProps) {
	const organizationId = useOrganizationId();
	const { employee, isOrganizationAdmin } = useActiveOrganization();
	const { confirm } = useConfirmationAlert();
	const createPayment = useCreatePayment();
	const { data: noteCategoriesData } = useNoteCategories();
	const noteCategories = noteCategoriesData?.categories ?? [];
	const { data: collectorsData } = useCollectors();
	const collectors = collectorsData?.collectors ?? [];

	const { accountPrice, iptvPrice, realIpPrice, discountAmount } =
		extractPriceComponents(customer);
	const totalDueDefault = calculateTotalDue(customer, { freeAccount: false });

	const [paidAmount, setPaidAmount] = useState(String(totalDueDefault));
	const [freeAccount, setFreeAccount] = useState(false);
	const [stoppedAccount, setStoppedAccount] = useState(false);
	const [noteCategory, setNoteCategory] = useState("");
	const [notes, setNotes] = useState("");

	// Admin-specific: collector selection and balance toggle
	const defaultCollectorId = employee?.id ?? customer.collector?.id ?? "";
	const [selectedCollectorId, setSelectedCollectorId] =
		useState(defaultCollectorId);
	const [addToCollectorBalance, setAddToCollectorBalance] = useState(true);

	// Confirmation step for admin
	const [showConfirm, setShowConfirm] = useState(false);

	const totalDue = calculateTotalDue(customer, { freeAccount });
	const unpaidMonths = customer.unpaidMonths ?? 1;
	const monthlyDue = customerMonthlyDue(customer);
	const paidAmountNum = parseAmount(paidAmount);
	const amountDiff = paidAmountNum - totalDue;
	const leniency = leniencyReason({
		name:
			getDisplayName(customer.firstName, customer.lastName) ||
			customer.username ||
			"This customer",
		freeAccount,
		stoppedAccount,
		paidAmount: paidAmountNum,
		totalDue,
	});

	function handleFormSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (isOrganizationAdmin) {
			setShowConfirm(true);
			return;
		}
		// Collectors skip the admin confirm step, so the leniency warning is
		// the one gate they see before a free/stopped/short month is recorded.
		if (leniency) {
			confirm({
				title: "Nothing collected — are you sure?",
				message: `${leniency} ${LENIENCY_NOTICE}`,
				confirmLabel: "Record anyway",
				destructive: true,
				onConfirm: () => submitPayment(),
			});
			return;
		}
		submitPayment();
	}

	function submitPayment() {
		const collectorId = isOrganizationAdmin
			? selectedCollectorId
			: (employee?.id ?? customer.collector?.id);
		if (!organizationId || !collectorId) {
			toast.error("No collector assigned to this customer");
			return;
		}

		// When admin opts out of adding to collector's balance, set workerId
		// to the admin's employee ID so the cash isn't counted as in the
		// collector's hand.
		const workerId =
			isOrganizationAdmin && !addToCollectorBalance
				? employee?.id
				: undefined;

		createPayment.mutate(
			{
				organizationId,
				customerId: customer.id,
				collectorId,
				accountPrice,
				paidAmount: paidAmountNum,
				discount: discountAmount,
				freeAccount,
				stoppedAccount,
				workerId: workerId || undefined,
				noteCategory: noteCategory || undefined,
				notes: notes || undefined,
			},
			{
				onSuccess: () => {
					toast.success("Payment recorded");
					setShowConfirm(false);
					onOpenChange(false);
				},
				onError: (error) => {
					toast.error(error.message);
				},
			},
		);
	}

	const name =
		getDisplayName(customer.firstName, customer.lastName) ||
		customer.username ||
		"\u2014";

	const collectorName =
		collectors.find((c) => c.id === selectedCollectorId)?.name ??
		customer.collector?.name ??
		"Unknown";

	// Confirmation step for admin
	if (showConfirm) {
		return (
			<Dialog
				open={open}
				onOpenChange={(o) => {
					if (!o) {
						setShowConfirm(false);
						onOpenChange(false);
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Confirm Payment</DialogTitle>
					</DialogHeader>

					<div className="space-y-4">
						{/* Nothing (or not everything) is being collected —
						    same notice the collector portal shows. */}
						{leniency && (
							<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200">
								{leniency} {LENIENCY_NOTICE}
							</div>
						)}
						{/* Payment summary */}
						<div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									Customer
								</span>
								<span className="font-medium">{name}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									Amount
								</span>
								<span className="font-medium">
									{formatCurrency(paidAmountNum)}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									Collector
								</span>
								<span className="font-medium">
									{collectorName}
								</span>
							</div>
							{freeAccount && (
								<div className="flex justify-between">
									<span className="text-muted-foreground">
										Free Account
									</span>
									<span className="font-medium text-blue-600">
										Yes
									</span>
								</div>
							)}
							{stoppedAccount && (
								<div className="flex justify-between">
									<span className="text-muted-foreground">
										Stopped
									</span>
									<span className="font-medium text-red-600">
										Yes
									</span>
								</div>
							)}
						</div>

						{/* Add to collector balance toggle */}
						<div className="rounded-lg border p-3 space-y-2">
							<div className="flex items-center justify-between">
								<div>
									<Label
										htmlFor="addToBalance"
										className="text-sm font-medium"
									>
										Add cash to collector&apos;s balance
									</Label>
									<p className="text-xs text-muted-foreground mt-0.5">
										{addToCollectorBalance
											? `${collectorName} physically collected this cash`
											: "Cash was not collected by the collector"}
									</p>
								</div>
								<Switch
									id="addToBalance"
									checked={addToCollectorBalance}
									onCheckedChange={setAddToCollectorBalance}
								/>
							</div>
						</div>

						<div className="flex gap-2">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => setShowConfirm(false)}
							>
								Back
							</Button>
							<Button
								className="flex-1"
								onClick={submitPayment}
								disabled={createPayment.isPending}
							>
								{createPayment.isPending
									? "Recording..."
									: "Confirm Payment"}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Record Payment</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleFormSubmit} className="space-y-4">
					{/* Customer summary */}
					<div className="rounded-lg bg-muted/50 p-3">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="truncate font-medium text-sm">
									{name}
								</p>
								{customer.plan && (
									<p className="truncate text-xs text-muted-foreground mt-0.5">
										{customer.plan.name}
									</p>
								)}
							</div>
							<div className="text-right shrink-0">
								<p className="text-lg font-bold tabular-nums">
									{formatCurrency(totalDue)}
								</p>
								{unpaidMonths > 1 && (
									<p className="text-xs text-muted-foreground tabular-nums">
										{formatCurrency(monthlyDue)}/mo &times;{" "}
										{unpaidMonths}
									</p>
								)}
							</div>
						</div>

						{/* Price breakdown */}
						<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
							<span>Account: {formatCurrency(accountPrice)}</span>
							{discountAmount > 0 && (
								<span>
									Discount: -{formatCurrency(discountAmount)}
								</span>
							)}
							{iptvPrice > 0 && (
								<span>IPTV: {formatCurrency(iptvPrice)}</span>
							)}
							{realIpPrice > 0 && (
								<span>
									Real IP: {formatCurrency(realIpPrice)}
								</span>
							)}
						</div>

						{unpaidMonths > 1 && (
							<Badge
								variant="destructive"
								className="mt-2 text-xs"
							>
								{unpaidMonths} months unpaid
							</Badge>
						)}
					</div>

					{/* Collector Selection (admin only) */}
					{isOrganizationAdmin && collectors.length > 0 && (
						<div>
							<Label>Collector</Label>
							<Select
								value={selectedCollectorId}
								onValueChange={setSelectedCollectorId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select collector" />
								</SelectTrigger>
								<SelectContent>
									{collectors.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Amount with currency prefix */}
					<div>
						<Label htmlFor="paidAmount">Amount Paid</Label>
						<div className="relative">
							<span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
								$
							</span>
							<Input
								id="paidAmount"
								type="number"
								step="0.01"
								min="0"
								value={paidAmount}
								onChange={(e) => setPaidAmount(e.target.value)}
								className="pl-7"
							/>
						</div>
						{/* Amount mismatch hint */}
						{!stoppedAccount &&
							!freeAccount &&
							amountDiff !== 0 &&
							paidAmountNum > 0 && (
								<p
									className={cn(
										"mt-1 text-xs font-medium",
										amountDiff > 0
											? "text-blue-600"
											: "text-amber-600",
									)}
								>
									{amountDiff > 0
										? `Overpaying by ${formatCurrency(amountDiff)}`
										: `Underpaying by ${formatCurrency(Math.abs(amountDiff))}`}
								</p>
							)}
					</div>

					{/* Flags */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<Label
								htmlFor="freeAccount"
								className="cursor-pointer"
							>
								Free Account
							</Label>
							<Switch
								id="freeAccount"
								checked={freeAccount}
								onCheckedChange={setFreeAccount}
							/>
						</div>
						<div className="flex items-center justify-between">
							<Label
								htmlFor="stoppedAccount"
								className="cursor-pointer"
							>
								Stopped
							</Label>
							<Switch
								id="stoppedAccount"
								checked={stoppedAccount}
								onCheckedChange={(checked) => {
									setStoppedAccount(checked);
									if (checked) {
										setPaidAmount("0");
									} else {
										setPaidAmount(String(totalDue));
									}
								}}
							/>
						</div>
					</div>

					{/* Note Category + Notes */}
					<div className="space-y-3 rounded-lg border p-3">
						<div>
							<Label className="text-xs text-muted-foreground">
								Note Category
							</Label>
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
							<Label
								htmlFor="notes"
								className="text-xs text-muted-foreground"
							>
								Notes
							</Label>
							<Textarea
								id="notes"
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder="Optional note..."
								rows={2}
								className="mt-1"
							/>
						</div>

						{stoppedAccount && !noteCategory && !notes.trim() && (
							<p className="text-xs font-medium text-destructive">
								A note or category is required for stopped
								accounts
							</p>
						)}
					</div>

					<Button
						type="submit"
						className="w-full"
						disabled={
							createPayment.isPending ||
							(stoppedAccount &&
								!noteCategory &&
								!notes.trim()) ||
							(isOrganizationAdmin && !selectedCollectorId)
						}
					>
						{isOrganizationAdmin ? "Continue" : "Record Payment"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
