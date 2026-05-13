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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	useBulkChangeCollector,
	useBulkResetMac,
	useBulkSetDiscount,
	useBulkSetExpiry,
	useBulkSetIptvPrice,
} from "../hooks/use-customers";

/**
 * Bulk iRadius dialogs. Each takes a single user input (or none) and a
 * selected customer-id set, then fans the action out via the matching
 * `bulk*` procedure. Result toasts share a single summary shape:
 *
 *   "X succeeded · Y skipped (no externalId) · Z failed"
 *
 * partial-failure toasts use the warning variant so operators see they
 * need to retry a subset; full-success uses `success`.
 *
 * All dialogs follow the same shadcn `Dialog` shell, label/input pattern,
 * and Cancel/Confirm footer used by the per-customer dialogs in
 * `CustomerIradiusDialogs.tsx` — keeps the bulk and single-customer UX
 * visually identical so muscle memory transfers between the two.
 */

interface BulkDialogShellProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	customerIds: string[];
	onCompleted?: () => void;
}

function summariseResult(result: {
	succeeded: number;
	skipped: number;
	failed: number;
}): { message: string; level: "success" | "warning" } {
	const parts: string[] = [`${result.succeeded} succeeded`];
	if (result.skipped > 0) {
		parts.push(`${result.skipped} skipped (no iRadius link)`);
	}
	if (result.failed > 0) {
		parts.push(`${result.failed} failed`);
	}
	return {
		message: parts.join(" · "),
		level: result.failed > 0 ? "warning" : "success",
	};
}

// ─── Bulk reset MAC ────────────────────────────────────────────────────

export function BulkResetMacDialog({
	open,
	onOpenChange,
	organizationId,
	customerIds,
	onCompleted,
}: BulkDialogShellProps) {
	const bulkResetMac = useBulkResetMac();
	const count = customerIds.length;

	function handleSubmit() {
		bulkResetMac.mutate(
			{ organizationId, customerIds },
			{
				onSuccess: (result) => {
					const summary = summariseResult(result);
					if (summary.level === "warning") {
						toast.warning(summary.message);
					} else {
						toast.success(summary.message);
					}
					onCompleted?.();
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
					<DialogTitle>
						Reset MAC address for {count} customer
						{count === 1 ? "" : "s"}?
					</DialogTitle>
					<DialogDescription>
						Clears the stored MAC on each selected customer in
						iRadius. Their next connection will re-learn a new MAC.
						Customers without an iRadius link are skipped.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={bulkResetMac.isPending}
						onClick={handleSubmit}
					>
						{bulkResetMac.isPending
							? "Resetting…"
							: `Reset all (${count})`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Bulk set discount ─────────────────────────────────────────────────

export function BulkSetDiscountDialog({
	open,
	onOpenChange,
	organizationId,
	customerIds,
	onCompleted,
}: BulkDialogShellProps) {
	const bulkSetDiscount = useBulkSetDiscount();
	const [value, setValue] = useState("0");

	useEffect(() => {
		if (open) {
			setValue("0");
		}
	}, [open]);

	function handleSubmit() {
		const parsed = Number.parseFloat(value);
		if (!Number.isFinite(parsed) || parsed < 0) {
			toast.error("Discount must be a non-negative number");
			return;
		}
		bulkSetDiscount.mutate(
			{ organizationId, customerIds, discount: parsed },
			{
				onSuccess: (result) => {
					const summary = summariseResult(result);
					if (summary.level === "warning") {
						toast.warning(summary.message);
					} else {
						toast.success(summary.message);
					}
					onCompleted?.();
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
					<DialogTitle>
						Set recurring discount for {customerIds.length} customer
						{customerIds.length === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						Applies the same recurring discount to every selected
						customer. Set to 0 to remove. Customers without an
						iRadius link are skipped.
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="bulk-discount">Discount amount</Label>
					<Input
						id="bulk-discount"
						type="number"
						step="0.01"
						min="0"
						inputMode="decimal"
						value={value}
						onChange={(e) => setValue(e.target.value)}
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
						disabled={bulkSetDiscount.isPending}
						onClick={handleSubmit}
					>
						{bulkSetDiscount.isPending ? "Saving…" : "Apply to all"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Bulk set IPTV price ───────────────────────────────────────────────

export function BulkSetIptvPriceDialog({
	open,
	onOpenChange,
	organizationId,
	customerIds,
	onCompleted,
}: BulkDialogShellProps) {
	const bulkSetIptvPrice = useBulkSetIptvPrice();
	const [value, setValue] = useState("0");

	useEffect(() => {
		if (open) {
			setValue("0");
		}
	}, [open]);

	function handleSubmit() {
		const parsed = Number.parseFloat(value);
		if (!Number.isFinite(parsed) || parsed < 0) {
			toast.error("IPTV price must be a non-negative number");
			return;
		}
		bulkSetIptvPrice.mutate(
			{ organizationId, customerIds, iptvPrice: parsed },
			{
				onSuccess: (result) => {
					const summary = summariseResult(result);
					if (summary.level === "warning") {
						toast.warning(summary.message);
					} else {
						toast.success(summary.message);
					}
					onCompleted?.();
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
					<DialogTitle>
						Set IPTV price for {customerIds.length} customer
						{customerIds.length === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						Sets the recurring IPTV add-on price for each selected
						customer. Set to 0 to remove. Customers without an
						iRadius link are skipped.
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="bulk-iptv">IPTV price</Label>
					<Input
						id="bulk-iptv"
						type="number"
						step="0.01"
						min="0"
						inputMode="decimal"
						value={value}
						onChange={(e) => setValue(e.target.value)}
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
						disabled={bulkSetIptvPrice.isPending}
						onClick={handleSubmit}
					>
						{bulkSetIptvPrice.isPending
							? "Saving…"
							: "Apply to all"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Bulk set expiry date ──────────────────────────────────────────────

export function BulkSetExpiryDialog({
	open,
	onOpenChange,
	organizationId,
	customerIds,
	onCompleted,
}: BulkDialogShellProps) {
	const bulkSetExpiry = useBulkSetExpiry();
	const [value, setValue] = useState("");

	useEffect(() => {
		if (open) {
			setValue("");
		}
	}, [open]);

	function handleSubmit() {
		const expiryDate = value || null;
		if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
			toast.error("Expected YYYY-MM-DD");
			return;
		}
		bulkSetExpiry.mutate(
			{ organizationId, customerIds, expiryDate },
			{
				onSuccess: (result) => {
					const summary = summariseResult(result);
					if (summary.level === "warning") {
						toast.warning(summary.message);
					} else {
						toast.success(summary.message);
					}
					onCompleted?.();
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
					<DialogTitle>
						Set billing expiry for {customerIds.length} customer
						{customerIds.length === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						Applies the same end-of-day expiry to each selected
						customer in iRadius. Clear the field to remove their
						expiry date. Customers without an iRadius link are
						skipped.
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="bulk-expiry">Expiry date</Label>
					<Input
						id="bulk-expiry"
						type="date"
						value={value}
						onChange={(e) => setValue(e.target.value)}
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
						disabled={bulkSetExpiry.isPending}
						onClick={handleSubmit}
					>
						{bulkSetExpiry.isPending ? "Saving…" : "Apply to all"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Bulk change collector ─────────────────────────────────────────────

interface BulkChangeCollectorDialogProps extends BulkDialogShellProps {
	collectors: Array<{ id: string; name: string }>;
}

export function BulkChangeCollectorDialog({
	open,
	onOpenChange,
	organizationId,
	customerIds,
	collectors,
	onCompleted,
}: BulkChangeCollectorDialogProps) {
	const bulkChangeCollector = useBulkChangeCollector();
	// Sentinel value used in the Select to represent "no collector"
	// because Radix's `<SelectItem value="">` is reserved for the
	// placeholder slot. We translate it back to `null` on submit.
	const NONE = "__none__";
	const [value, setValue] = useState<string>(NONE);

	useEffect(() => {
		if (open) {
			setValue(NONE);
		}
	}, [open]);

	function handleSubmit() {
		bulkChangeCollector.mutate(
			{
				organizationId,
				customerIds,
				collectorId: value === NONE ? null : value,
			},
			{
				onSuccess: (result) => {
					toast.success(
						`Reassigned ${result.succeeded} customer${result.succeeded === 1 ? "" : "s"}`,
					);
					onCompleted?.();
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
					<DialogTitle>
						Change collector for {customerIds.length} customer
						{customerIds.length === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						Reassigns each selected customer to the chosen
						collector. Local-only — does not push the new collector
						to iRadius (use the single-customer detail flow if you
						need that).
					</DialogDescription>
				</DialogHeader>
				<div>
					<Label htmlFor="bulk-collector">Collector</Label>
					<Select value={value} onValueChange={setValue}>
						<SelectTrigger id="bulk-collector">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NONE}>
								— Unassign collector —
							</SelectItem>
							{collectors.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						disabled={bulkChangeCollector.isPending}
						onClick={handleSubmit}
					>
						{bulkChangeCollector.isPending
							? "Saving…"
							: "Apply to all"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
