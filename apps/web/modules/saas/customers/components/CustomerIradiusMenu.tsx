"use client";

import { SyncPreviewDialog } from "@shared/components/SyncPreviewDialog";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	CalendarClockIcon,
	MonitorIcon,
	PercentIcon,
	RadioTowerIcon,
	RefreshCwIcon,
	UserCogIcon,
	WifiOffIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useResetMacAddress,
	useSetCustomerExpiryDate,
	useSetDiscount,
	useSetIptvPrice,
	useUpdateNameInIRadius,
} from "../hooks/use-customers";

interface CustomerIradiusMenuProps {
	organizationId: string;
	customer: {
		id: string;
		externalId: string | null;
		firstName: string | null;
		lastName: string | null;
		discount: number | null;
		iptvPrice: number | null;
		expiresAt: string | Date | null;
	};
}

type DialogState =
	| { kind: "none" }
	| { kind: "reset-mac" }
	| { kind: "update-name"; firstName: string; lastName: string }
	| { kind: "set-discount"; discount: string }
	| { kind: "set-iptv-price"; iptvPrice: string }
	| { kind: "set-expiry"; expiryDate: string };

function toDateInputValue(value: string | Date | null): string {
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

/**
 * Single iRadius surface in the customer header. Combines the
 * "Sync from iRadius" pull (preview + apply) with the five iRadius admin
 * actions (Reset MAC, Change name, Set discount, Set IPTV price, Set expiry).
 *
 * Hidden when the customer isn't linked to iRadius — there's nothing to do.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive single-responsibility iRadius menu; splitting would scatter tightly-coupled dialog wiring
export function CustomerIradiusMenu({
	organizationId,
	customer,
}: CustomerIradiusMenuProps) {
	const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
	const [showSyncPreview, setShowSyncPreview] = useState(false);
	const resetMac = useResetMacAddress();
	const updateName = useUpdateNameInIRadius();
	const setDiscount = useSetDiscount();
	const setIptvPrice = useSetIptvPrice();
	const setExpiryDate = useSetCustomerExpiryDate();

	if (!customer.externalId) {
		return null;
	}

	const anyPending =
		resetMac.isPending ||
		updateName.isPending ||
		setDiscount.isPending ||
		setIptvPrice.isPending ||
		setExpiryDate.isPending;

	function close() {
		setDialog({ kind: "none" });
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="sm" disabled={anyPending}>
						<RadioTowerIcon className="mr-2 size-4" />
						iRadius
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuLabel>Pull from iRadius</DropdownMenuLabel>
					<DropdownMenuItem onClick={() => setShowSyncPreview(true)}>
						<RefreshCwIcon className="mr-2 size-4" />
						Sync data from iRadius
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Apply in iRadius</DropdownMenuLabel>
					<DropdownMenuItem
						onClick={() => setDialog({ kind: "reset-mac" })}
					>
						<WifiOffIcon className="mr-2 size-4" />
						Reset MAC address
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() =>
							setDialog({
								kind: "update-name",
								firstName: customer.firstName ?? "",
								lastName: customer.lastName ?? "",
							})
						}
					>
						<UserCogIcon className="mr-2 size-4" />
						Change name
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() =>
							setDialog({
								kind: "set-discount",
								discount: (customer.discount ?? 0).toString(),
							})
						}
					>
						<PercentIcon className="mr-2 size-4" />
						Set recurring discount
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() =>
							setDialog({
								kind: "set-iptv-price",
								iptvPrice: (customer.iptvPrice ?? 0).toString(),
							})
						}
					>
						<MonitorIcon className="mr-2 size-4" />
						Set IPTV price
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() =>
							setDialog({
								kind: "set-expiry",
								expiryDate: toDateInputValue(
									customer.expiresAt,
								),
							})
						}
					>
						<CalendarClockIcon className="mr-2 size-4" />
						Set billing expiry date
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<SyncPreviewDialog
				open={showSyncPreview}
				onOpenChange={setShowSyncPreview}
				entityType="customer"
				entityIds={[customer.id]}
			/>

			{/* Reset MAC */}
			<Dialog
				open={dialog.kind === "reset-mac"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reset MAC address?</DialogTitle>
						<DialogDescription>
							Clears the stored MAC in iRadius. The customer's
							next connection will re-learn a new one. No
							disconnection is forced.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							disabled={resetMac.isPending}
							onClick={() => {
								resetMac.mutate(
									{ organizationId, customerId: customer.id },
									{
										onSuccess: () => {
											toast.success("MAC address reset");
											close();
										},
										onError: (err) =>
											toast.error(err.message),
									},
								);
							}}
						>
							{resetMac.isPending ? "Resetting…" : "Reset MAC"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Change name */}
			<Dialog
				open={dialog.kind === "update-name"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change customer name</DialogTitle>
						<DialogDescription>
							Updates first/last name in iRadius and mirrors the
							change locally.
						</DialogDescription>
					</DialogHeader>
					{dialog.kind === "update-name" && (
						<div className="space-y-3">
							<div>
								<Label htmlFor="iradius-first-name">
									First name
								</Label>
								<Input
									id="iradius-first-name"
									value={dialog.firstName}
									onChange={(e) =>
										setDialog({
											...dialog,
											firstName: e.target.value,
										})
									}
								/>
							</div>
							<div>
								<Label htmlFor="iradius-last-name">
									Last name (optional)
								</Label>
								<Input
									id="iradius-last-name"
									value={dialog.lastName}
									onChange={(e) =>
										setDialog({
											...dialog,
											lastName: e.target.value,
										})
									}
								/>
							</div>
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							disabled={updateName.isPending}
							onClick={() => {
								if (dialog.kind !== "update-name") {
									return;
								}
								const firstName = dialog.firstName.trim();
								const lastName = dialog.lastName.trim();
								if (!firstName) {
									toast.error("First name is required");
									return;
								}
								updateName.mutate(
									{
										organizationId,
										customerId: customer.id,
										firstName,
										lastName,
									},
									{
										onSuccess: () => {
											toast.success("Name updated");
											close();
										},
										onError: (err) =>
											toast.error(err.message),
									},
								);
							}}
						>
							{updateName.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Discount */}
			<Dialog
				open={dialog.kind === "set-discount"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Set recurring discount</DialogTitle>
						<DialogDescription>
							Applied to the customer's future invoices. Set to 0
							to remove.
						</DialogDescription>
					</DialogHeader>
					{dialog.kind === "set-discount" && (
						<div>
							<Label htmlFor="iradius-discount">
								Discount amount
							</Label>
							<Input
								id="iradius-discount"
								type="number"
								step="0.01"
								min="0"
								inputMode="decimal"
								value={dialog.discount}
								onChange={(e) =>
									setDialog({
										...dialog,
										discount: e.target.value,
									})
								}
							/>
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							disabled={setDiscount.isPending}
							onClick={() => {
								if (dialog.kind !== "set-discount") {
									return;
								}
								const value = Number.parseFloat(
									dialog.discount,
								);
								if (!Number.isFinite(value) || value < 0) {
									toast.error(
										"Discount must be a non-negative number",
									);
									return;
								}
								setDiscount.mutate(
									{
										organizationId,
										customerId: customer.id,
										discount: value,
									},
									{
										onSuccess: () => {
											toast.success("Discount updated");
											close();
										},
										onError: (err) =>
											toast.error(err.message),
									},
								);
							}}
						>
							{setDiscount.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* IPTV price */}
			<Dialog
				open={dialog.kind === "set-iptv-price"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Set IPTV price</DialogTitle>
						<DialogDescription>
							Added on top of the plan's monthly price when the
							next invoice is generated. Set to 0 to remove.
						</DialogDescription>
					</DialogHeader>
					{dialog.kind === "set-iptv-price" && (
						<div>
							<Label htmlFor="iradius-iptv-price">
								IPTV price
							</Label>
							<Input
								id="iradius-iptv-price"
								type="number"
								step="0.01"
								min="0"
								inputMode="decimal"
								value={dialog.iptvPrice}
								onChange={(e) =>
									setDialog({
										...dialog,
										iptvPrice: e.target.value,
									})
								}
							/>
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							disabled={setIptvPrice.isPending}
							onClick={() => {
								if (dialog.kind !== "set-iptv-price") {
									return;
								}
								const value = Number.parseFloat(
									dialog.iptvPrice,
								);
								if (!Number.isFinite(value) || value < 0) {
									toast.error(
										"IPTV price must be a non-negative number",
									);
									return;
								}
								setIptvPrice.mutate(
									{
										organizationId,
										customerId: customer.id,
										iptvPrice: value,
									},
									{
										onSuccess: () => {
											toast.success("IPTV price updated");
											close();
										},
										onError: (err) =>
											toast.error(err.message),
									},
								);
							}}
						>
							{setIptvPrice.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Expiry */}
			<Dialog
				open={dialog.kind === "set-expiry"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Set billing expiry date</DialogTitle>
						<DialogDescription>
							Overrides the customer's RADIUS expiry in iRadius
							(UserNas.ExpiryAccount) and mirrors the value
							locally. Set at 23:59 of the chosen day. Leave empty
							and save to clear the expiry.
						</DialogDescription>
					</DialogHeader>
					{dialog.kind === "set-expiry" && (
						<div>
							<Label htmlFor="iradius-expiry-date">
								Expiry date
							</Label>
							<Input
								id="iradius-expiry-date"
								type="date"
								value={dialog.expiryDate}
								onChange={(e) =>
									setDialog({
										...dialog,
										expiryDate: e.target.value,
									})
								}
							/>
						</div>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={close}>
							Cancel
						</Button>
						<Button
							disabled={setExpiryDate.isPending}
							onClick={() => {
								if (dialog.kind !== "set-expiry") {
									return;
								}
								const value = dialog.expiryDate.trim() || null;
								setExpiryDate.mutate(
									{
										organizationId,
										customerId: customer.id,
										expiryDate: value,
									},
									{
										onSuccess: () => {
											toast.success(
												value
													? "Expiry date updated"
													: "Expiry date cleared",
											);
											close();
										},
										onError: (err) =>
											toast.error(err.message),
									},
								);
							}}
						>
							{setExpiryDate.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
