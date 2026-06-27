"use client";

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
import { useRef } from "react";
import { toast } from "sonner";
import {
	useResetMacAddress,
	useSetCustomerExpiryDate,
	useSetDiscount,
	useSetIptvPrice,
	useUpdateNameInIRadius,
} from "../hooks/use-customers";

/**
 * Reusable per-customer iRadius admin dialogs. The dropdown menu items on
 * both the customer detail header (`CustomerIradiusMenu`) and the customer
 * row dropdown (`CustomerRowActions`) flip these dialogs open by passing
 * `open` + `onOpenChange` from local state. The dialog bodies own their
 * input state and validation; the parent just decides which is visible.
 *
 * Each dialog hard-requires `externalId` so the iRadius mirror has
 * something to write to — callers should hide the trigger when missing.
 */

export interface IradiusCustomerRef {
	id: string;
	externalId: string | null;
	firstName?: string | null;
	lastName?: string | null;
	discount?: number | null;
	iptvPrice?: number | null;
	expiresAt?: string | Date | null;
}

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	customer: IradiusCustomerRef;
}

function toDateInputValue(value: string | Date | null | undefined): string {
	if (!value) {
		return "";
	}
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) {
		return "";
	}
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// ─── Reset MAC ─────────────────────────────────────────────────────────

export function ResetMacDialog({
	open,
	onOpenChange,
	organizationId,
	customer,
}: DialogProps) {
	const resetMac = useResetMacAddress();

	function handleReset() {
		resetMac.mutate(
			{ organizationId, customerId: customer.id },
			{
				onSuccess: () => {
					toast.success("MAC address reset");
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
					<DialogTitle>Reset MAC address?</DialogTitle>
					<DialogDescription>
						Clears the stored MAC in iRadius. The customer's next
						connection will re-learn a new one. No disconnection is
						forced.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button disabled={resetMac.isPending} onClick={handleReset}>
						{resetMac.isPending ? "Resetting…" : "Reset MAC"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Change name ───────────────────────────────────────────────────────

export function ChangeNameDialog({
	open,
	onOpenChange,
	organizationId,
	customer,
}: DialogProps) {
	const updateName = useUpdateNameInIRadius();
	// Uncontrolled inputs: Radix unmounts the dialog body on close, so the
	// `defaultValue`s re-seed from the current customer on each reopen — no
	// state mirror or reset effect needed.
	const firstNameRef = useRef<HTMLInputElement>(null);
	const lastNameRef = useRef<HTMLInputElement>(null);

	function handleSave() {
		const f = (firstNameRef.current?.value ?? "").trim();
		const l = (lastNameRef.current?.value ?? "").trim();
		if (!f) {
			toast.error("First name is required");
			return;
		}
		updateName.mutate(
			{
				organizationId,
				customerId: customer.id,
				firstName: f,
				lastName: l,
			},
			{
				onSuccess: () => {
					toast.success("Name updated");
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
					<DialogTitle>Change customer name</DialogTitle>
					<DialogDescription>
						Updates first/last name in iRadius and mirrors the
						change locally.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label htmlFor="iradius-first-name">First name</Label>
						<Input
							id="iradius-first-name"
							ref={firstNameRef}
							defaultValue={customer.firstName ?? ""}
						/>
					</div>
					<div>
						<Label htmlFor="iradius-last-name">
							Last name (optional)
						</Label>
						<Input
							id="iradius-last-name"
							ref={lastNameRef}
							defaultValue={customer.lastName ?? ""}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={updateName.isPending}
						onClick={handleSave}
					>
						{updateName.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Set discount ──────────────────────────────────────────────────────

export function SetDiscountDialog({
	open,
	onOpenChange,
	organizationId,
	customer,
}: DialogProps) {
	const setDiscount = useSetDiscount();
	// Uncontrolled: re-seeds from `defaultValue` on each reopen (Radix
	// unmounts the dialog body on close).
	const valueRef = useRef<HTMLInputElement>(null);

	function handleSave() {
		const parsed = Number.parseFloat(valueRef.current?.value ?? "");
		if (!Number.isFinite(parsed) || parsed < 0) {
			toast.error("Discount must be a non-negative number");
			return;
		}
		setDiscount.mutate(
			{
				organizationId,
				customerId: customer.id,
				discount: parsed,
			},
			{
				onSuccess: () => {
					toast.success("Discount updated");
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
					<DialogTitle>Set recurring discount</DialogTitle>
					<DialogDescription>
						Applied to the customer's future invoices. Set to 0 to
						remove.
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="iradius-discount">Discount amount</Label>
					<Input
						id="iradius-discount"
						type="number"
						step="0.01"
						min="0"
						inputMode="decimal"
						ref={valueRef}
						defaultValue={(customer.discount ?? 0).toString()}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={setDiscount.isPending}
						onClick={handleSave}
					>
						{setDiscount.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Set IPTV price ────────────────────────────────────────────────────

export function SetIptvPriceDialog({
	open,
	onOpenChange,
	organizationId,
	customer,
}: DialogProps) {
	const setIptvPrice = useSetIptvPrice();
	// Uncontrolled: re-seeds from `defaultValue` on each reopen (Radix
	// unmounts the dialog body on close).
	const valueRef = useRef<HTMLInputElement>(null);

	function handleSave() {
		const parsed = Number.parseFloat(valueRef.current?.value ?? "");
		if (!Number.isFinite(parsed) || parsed < 0) {
			toast.error("IPTV price must be a non-negative number");
			return;
		}
		setIptvPrice.mutate(
			{
				organizationId,
				customerId: customer.id,
				iptvPrice: parsed,
			},
			{
				onSuccess: () => {
					toast.success("IPTV price updated");
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
					<DialogTitle>Set IPTV price</DialogTitle>
					<DialogDescription>
						Sets the recurring IPTV add-on price for this customer.
						Set to 0 to remove.
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="iradius-iptv">IPTV price</Label>
					<Input
						id="iradius-iptv"
						type="number"
						step="0.01"
						min="0"
						inputMode="decimal"
						ref={valueRef}
						defaultValue={(customer.iptvPrice ?? 0).toString()}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={setIptvPrice.isPending}
						onClick={handleSave}
					>
						{setIptvPrice.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Set expiry date ───────────────────────────────────────────────────

export function SetExpiryDialog({
	open,
	onOpenChange,
	organizationId,
	customer,
}: DialogProps) {
	const setExpiryDate = useSetCustomerExpiryDate();
	// Uncontrolled: re-seeds from `defaultValue` on each reopen (Radix
	// unmounts the dialog body on close).
	const valueRef = useRef<HTMLInputElement>(null);

	function handleSave() {
		// Pass null when cleared so iRadius removes the expiry date.
		const expiryDate = valueRef.current?.value || null;
		if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
			toast.error("Expected YYYY-MM-DD");
			return;
		}
		setExpiryDate.mutate(
			{
				organizationId,
				customerId: customer.id,
				expiryDate,
			},
			{
				onSuccess: () => {
					toast.success("Expiry date updated");
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
					<DialogTitle>Set billing expiry date</DialogTitle>
					<DialogDescription>
						Sets the next billing cycle expiry in iRadius (stored
						end-of-day, 23:59). Clear the field to remove.
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="iradius-expiry">Expiry date</Label>
					<Input
						id="iradius-expiry"
						type="date"
						ref={valueRef}
						defaultValue={toDateInputValue(customer.expiresAt)}
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={setExpiryDate.isPending}
						onClick={handleSave}
					>
						{setExpiryDate.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
