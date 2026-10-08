"use client";

import { CustomerCombobox } from "@shared/components/CustomerCombobox";
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
import { PhoneInput } from "@ui/components/phone-input";
import { Textarea } from "@ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateFiberLead } from "../hooks/use-fiber";

/**
 * Add a lead by hand: an existing customer, or someone who isn't one yet
 * (a neighbour, a building contact, a walk-in).
 */
export function AddFiberLeadDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const organizationId = useOrganizationId();
	const create = useCreateFiberLead();
	const [customer, setCustomer] = useState<{
		id: string;
		name: string;
		username: string | null;
	} | null>(null);
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [area, setArea] = useState("");
	const [notes, setNotes] = useState("");
	const canSave = !!customer || !!name.trim() || !!phone.trim();

	function submit(e: React.FormEvent) {
		e.preventDefault();
		if (!organizationId || !canSave) {
			return;
		}
		create.mutate(
			{
				organizationId,
				...(customer ? { customerId: customer.id } : {}),
				...(name.trim() ? { name: name.trim() } : {}),
				...(phone.trim() ? { phone: phone.trim() } : {}),
				...(area.trim() ? { area: area.trim() } : {}),
				...(notes.trim() ? { notes: notes.trim() } : {}),
			},
			{
				onSuccess: (r) => {
					toast.success(
						r.existed ? "Already in the pipeline" : "Lead added",
					);
					onOpenChange(false);
				},
				onError: (err) => toast.error(err.message),
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add a fiber lead</DialogTitle>
					<DialogDescription>
						Pick a customer, or type the details of someone who
						isn't one yet.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-3">
					<div className="space-y-1.5">
						<Label>Existing customer</Label>
						<CustomerCombobox
							value={customer}
							onChange={setCustomer}
							placeholder="Search customers…"
						/>
					</div>
					{!customer && (
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="fiber-lead-name">Name</Label>
								<Input
									id="fiber-lead-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>Phone</Label>
								<PhoneInput value={phone} onChange={setPhone} />
							</div>
							<div className="space-y-1.5 sm:col-span-2">
								<Label htmlFor="fiber-lead-area">Area</Label>
								<Input
									id="fiber-lead-area"
									placeholder="e.g. Sabtiyeh"
									value={area}
									onChange={(e) => setArea(e.target.value)}
								/>
							</div>
						</div>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="fiber-lead-notes">Note</Label>
						<Textarea
							id="fiber-lead-notes"
							rows={2}
							className="resize-none"
							placeholder="Where they heard about us, what they asked…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="submit"
							disabled={!canSave || create.isPending}
						>
							Add lead
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
