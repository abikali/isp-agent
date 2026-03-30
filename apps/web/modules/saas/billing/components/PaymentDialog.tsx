"use client";

import { useActiveOrganization } from "@saas/organizations/client";
import { formatCurrency } from "@shared/lib/format";
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
import { useCreatePayment, useNoteCategories } from "../hooks/use-billing";
import {
	calculateTotalDue,
	extractPriceComponents,
	parseAmount,
} from "../lib/billing-utils";

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

export function PaymentDialog({
	open,
	onOpenChange,
	customer,
}: PaymentDialogProps) {
	const organizationId = useOrganizationId();
	const { employee } = useActiveOrganization();
	const createPayment = useCreatePayment();
	const { data: noteCategoriesData } = useNoteCategories();
	const noteCategories = noteCategoriesData?.categories ?? [];

	const { accountPrice, iptvPrice, realIpPrice, discountAmount } =
		extractPriceComponents(customer);
	const totalDueDefault = calculateTotalDue(customer, { freeAccount: false });

	const [paidAmount, setPaidAmount] = useState(String(totalDueDefault));
	const [freeAccount, setFreeAccount] = useState(false);
	const [stoppedAccount, setStoppedAccount] = useState(false);
	const [noteCategory, setNoteCategory] = useState("");
	const [notes, setNotes] = useState("");

	const totalDue = calculateTotalDue(customer, { freeAccount });

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
				paidAmount: parseAmount(paidAmount),
				discount: discountAmount,
				freeAccount,
				stoppedAccount,
				noteCategory: noteCategory || undefined,
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
							Total Due: {formatCurrency(totalDue)}
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
						<Label htmlFor="notes">Notes</Label>
						<Textarea
							id="notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Optional note..."
							rows={2}
						/>
					</div>

					{stoppedAccount && !noteCategory && !notes.trim() && (
						<p className="text-sm font-medium text-destructive">
							Note required for stopped accounts
						</p>
					)}

					<Button
						type="submit"
						className="w-full"
						disabled={
							createPayment.isPending ||
							(stoppedAccount && !noteCategory && !notes.trim())
						}
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
