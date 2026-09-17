"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
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
import { Field, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { LoaderIcon, SendIcon } from "lucide-react";
import { useState } from "react";

interface ContactCard {
	name: string;
	phone: string;
}

interface CustomerPick {
	id: string;
	name: string;
	username: string | null;
	mobile?: string | null;
}

/**
 * Pick a contact card to send into the chat: fill it from an employee or a
 * customer, or type it in. Mounted only while open so the pickers don't
 * query in the background.
 */
export function ShareContactDialog({
	onSend,
	onClose,
	isSending,
}: {
	onSend: (contact: ContactCard) => void;
	onClose: () => void;
	isSending: boolean;
}) {
	const { employees } = useEmployeesQuery();
	const [employeeId, setEmployeeId] = useState("");
	const [customer, setCustomer] = useState<CustomerPick | null>(null);
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");

	const withPhone = employees.filter((e) => e.phone);
	const canSend = name.trim().length > 0 && phone.trim().length > 0;

	function handleSend() {
		if (canSend && !isSending) {
			onSend({ name: name.trim(), phone: phone.trim() });
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Share a contact</DialogTitle>
					<DialogDescription>
						Sends a contact card the customer can save or tap to
						call.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<Field>
						<FieldLabel htmlFor="share-contact-employee">
							From an employee
						</FieldLabel>
						<Combobox
							id="share-contact-employee"
							options={withPhone.map((e) => ({
								value: e.id,
								label: `${e.name} — ${e.phone}`,
							}))}
							value={employeeId}
							onChange={(id) => {
								const employee = withPhone.find(
									(e) => e.id === id,
								);
								setEmployeeId(id);
								setCustomer(null);
								if (employee) {
									setName(employee.name);
									setPhone(employee.phone ?? "");
								}
							}}
							placeholder="Select employee…"
							searchPlaceholder="Search employees…"
							emptyText="No employees with a phone"
						/>
					</Field>

					<Field>
						<FieldLabel>From a customer</FieldLabel>
						<CustomerCombobox
							value={customer}
							onChange={(picked) => {
								setCustomer(picked);
								setEmployeeId("");
								if (picked) {
									setName(picked.name);
									setPhone(picked.mobile ?? "");
								}
							}}
						/>
					</Field>

					<div className="grid gap-3 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="share-contact-name">
								Name
							</FieldLabel>
							<Input
								id="share-contact-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={100}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="share-contact-phone">
								Phone
							</FieldLabel>
							<Input
								id="share-contact-phone"
								type="tel"
								value={phone}
								onChange={(e) => setPhone(e.target.value)}
								placeholder="+961 70 123 456"
								maxLength={40}
							/>
						</Field>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSend}
						disabled={!canSend || isSending}
					>
						{isSending ? (
							<LoaderIcon className="size-4 animate-spin" />
						) : (
							<SendIcon className="size-4" />
						)}
						Send contact
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
