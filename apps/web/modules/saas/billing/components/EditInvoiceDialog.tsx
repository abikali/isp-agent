"use client";

import { useOrganizationId } from "@shared/lib/organization";
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
import { Switch } from "@ui/components/switch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useInvoice, useUpdateInvoice } from "../hooks/use-billing";

interface Props {
	invoiceId: string | null;
	onClose: () => void;
}

function toDateInput(d: string | Date | null | undefined): string {
	if (!d) {
		return "";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	return date.toISOString().slice(0, 10);
}

export function EditInvoiceDialog({ invoiceId, onClose }: Props) {
	const organizationId = useOrganizationId();
	const { data } = useInvoice(invoiceId);
	const invoice = data?.invoice;

	const [total, setTotal] = useState("");
	const [discount, setDiscount] = useState("");
	const [tax, setTax] = useState("");
	const [totalWithTax, setTotalWithTax] = useState("");
	const [expiryDate, setExpiryDate] = useState("");
	const [paid, setPaid] = useState(false);

	useEffect(() => {
		if (invoice) {
			setTotal(String(invoice.total));
			setDiscount(String(invoice.discount));
			setTax(String(invoice.tax));
			setTotalWithTax(String(invoice.totalWithTax));
			setExpiryDate(toDateInput(invoice.expiryDate));
			setPaid(invoice.paid);
		}
	}, [invoice]);

	const update = useUpdateInvoice();

	function submit() {
		if (!organizationId || !invoiceId) {
			return;
		}
		update.mutate(
			{
				organizationId,
				invoiceId,
				total: Number.parseFloat(total),
				discount: Number.parseFloat(discount),
				tax: Number.parseFloat(tax),
				totalWithTax: Number.parseFloat(totalWithTax),
				...(expiryDate
					? { expiryDate: new Date(expiryDate).toISOString() }
					: {}),
				paid,
			},
			{
				onSuccess: () => {
					toast.success("Invoice updated");
					onClose();
				},
				onError: (err) => toast.error(err.message || "Failed"),
			},
		);
	}

	return (
		<Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Edit Invoice</DialogTitle>
					<DialogDescription>
						{invoice
							? `${invoice.customer.firstName ?? ""} ${invoice.customer.lastName ?? ""} — ${String(invoice.month).padStart(2, "0")}/${invoice.year}`
							: ""}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<Label htmlFor="total">Total</Label>
						<Input
							id="total"
							type="number"
							step="0.01"
							value={total}
							onChange={(e) => setTotal(e.target.value)}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<Label htmlFor="discount">Discount</Label>
							<Input
								id="discount"
								type="number"
								step="0.01"
								value={discount}
								onChange={(e) => setDiscount(e.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="tax">Tax</Label>
							<Input
								id="tax"
								type="number"
								step="0.01"
								value={tax}
								onChange={(e) => setTax(e.target.value)}
							/>
						</div>
					</div>

					<div>
						<Label htmlFor="totalWithTax">Total (TTC)</Label>
						<Input
							id="totalWithTax"
							type="number"
							step="0.01"
							value={totalWithTax}
							onChange={(e) => setTotalWithTax(e.target.value)}
						/>
					</div>

					<div>
						<Label htmlFor="expiryDate">Due date</Label>
						<Input
							id="expiryDate"
							type="date"
							value={expiryDate}
							onChange={(e) => setExpiryDate(e.target.value)}
						/>
					</div>

					<div className="flex items-center justify-between">
						<Label htmlFor="paid">Marked paid</Label>
						<Switch
							id="paid"
							checked={paid}
							onCheckedChange={setPaid}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={update.isPending}
					>
						Cancel
					</Button>
					<Button onClick={submit} disabled={update.isPending}>
						{update.isPending ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
