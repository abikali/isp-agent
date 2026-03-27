"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { useOrganizationId } from "@shared/lib/organization";
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
import { useState } from "react";
import { toast } from "sonner";
import { useCreatePayment } from "../hooks/use-billing";

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
		plan?: { name: string; monthlyPrice?: number | null } | null;
		collector?: { id: string; name: string } | null;
	};
}

const NOTE_CATEGORIES = [
	{ value: "DOWNGRADE", label: "Downgrade" },
	{ value: "UPGRADE", label: "Upgrade" },
	{ value: "DISCOUNT", label: "Discount" },
	{ value: "REFERRAL", label: "Friend Referral" },
	{ value: "MOVED", label: "Moved House" },
	{ value: "POOR_SERVICE", label: "Poor Service" },
	{ value: "CANT_PAY", label: "Can't Pay" },
	{ value: "TEMP_STOP", label: "Temporary Stop" },
] as const;

export function PaymentDialog({
	open,
	onOpenChange,
	customer,
}: PaymentDialogProps) {
	const organizationId = useOrganizationId();
	const { employee } = useActiveOrganization();
	const createPayment = useCreatePayment();

	const accountPrice =
		customer.monthlyRate ?? customer.plan?.monthlyPrice ?? 0;
	const iptvPrice = customer.iptvPrice ?? 0;
	const realIpPrice = customer.realIpPrice ?? 0;
	const discountAmount = customer.discount ?? 0;

	const [paidAmount, setPaidAmount] = useState(
		String(accountPrice + iptvPrice + realIpPrice - discountAmount),
	);
	const [freeAccount, setFreeAccount] = useState(false);
	const [stoppedAccount, setStoppedAccount] = useState(false);
	const [noteCategory, setNoteCategory] = useState("");
	const [notes, setNotes] = useState("");

	const totalDue = freeAccount
		? iptvPrice + realIpPrice
		: accountPrice + iptvPrice + realIpPrice - discountAmount;

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		// Prefer logged-in employee, fall back to customer's assigned collector
		const collectorId = employee?.id ?? customer.collector?.id;
		if (!organizationId || !collectorId) {
			return;
		}

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
			},
			{
				onSuccess: () => {
					toast.success("Payment recorded");
					onOpenChange(false);
				},
				onError: (error) => {
					toast.error(error.message);
				},
			},
		);
	}

	const displayName =
		[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
		customer.username ||
		"—";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Record Payment</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Customer Info (read-only) */}
					<div className="rounded-lg bg-muted/50 p-3 text-sm">
						<div className="font-medium">{displayName}</div>
						{customer.plan && (
							<div className="text-muted-foreground">
								{customer.plan.name}
							</div>
						)}
						<div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
							<div>Account: ${accountPrice}</div>
							<div>Discount: ${discountAmount}</div>
							{iptvPrice > 0 && <div>IPTV: ${iptvPrice}</div>}
							{realIpPrice > 0 && (
								<div>Real IP: ${realIpPrice}</div>
							)}
						</div>
						<div className="mt-2 border-t pt-2 font-medium">
							Total Due: ${totalDue.toFixed(2)}
						</div>
					</div>

					{/* Amount */}
					<div>
						<Label htmlFor="paidAmount">Amount Paid</Label>
						<Input
							id="paidAmount"
							type="number"
							step="0.01"
							min="0"
							value={paidAmount}
							onChange={(e) => setPaidAmount(e.target.value)}
						/>
					</div>

					{/* Flags */}
					<div className="flex items-center gap-6">
						<div className="flex items-center gap-2">
							<Switch
								id="freeAccount"
								checked={freeAccount}
								onCheckedChange={setFreeAccount}
							/>
							<Label htmlFor="freeAccount">Free Account</Label>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								id="stoppedAccount"
								checked={stoppedAccount}
								onCheckedChange={setStoppedAccount}
							/>
							<Label htmlFor="stoppedAccount">Stopped</Label>
						</div>
					</div>

					{/* Note Category */}
					<div>
						<Label>Note Category</Label>
						<Select
							value={noteCategory}
							onValueChange={setNoteCategory}
						>
							<SelectTrigger>
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
						<Label htmlFor="notes">Notes</Label>
						<Textarea
							id="notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Optional note..."
							rows={2}
						/>
					</div>

					<Button
						type="submit"
						className="w-full"
						disabled={createPayment.isPending}
					>
						{createPayment.isPending
							? "Recording..."
							: "Record Payment"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
