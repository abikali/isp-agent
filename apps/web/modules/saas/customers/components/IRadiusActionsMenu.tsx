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
	MonitorIcon,
	PercentIcon,
	UserCogIcon,
	WifiOffIcon,
	ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useResetMacAddress,
	useSetDiscount,
	useSetIptvPrice,
	useUpdateNameInIRadius,
} from "../hooks/use-customers";

interface IRadiusActionsMenuProps {
	organizationId: string;
	customer: {
		id: string;
		externalId: string | null;
		firstName: string | null;
		lastName: string | null;
		discount: number | null;
		iptvPrice: number | null;
	};
}

type DialogState =
	| { kind: "none" }
	| { kind: "reset-mac" }
	| { kind: "update-name"; firstName: string; lastName: string }
	| { kind: "set-discount"; discount: string }
	| { kind: "set-iptv-price"; iptvPrice: string };

/**
 * iRadius admin actions dropdown for the customer detail page.
 * Each action fires a direct-SQL write to iRadius via our backend wrapper
 * procedures, mirrors the value locally, and toasts the result.
 */
export function IRadiusActionsMenu({
	organizationId,
	customer,
}: IRadiusActionsMenuProps) {
	const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
	const resetMac = useResetMacAddress();
	const updateName = useUpdateNameInIRadius();
	const setDiscount = useSetDiscount();
	const setIptvPrice = useSetIptvPrice();

	const isLinked = !!customer.externalId;
	const anyPending =
		resetMac.isPending ||
		updateName.isPending ||
		setDiscount.isPending ||
		setIptvPrice.isPending;

	function close() {
		setDialog({ kind: "none" });
	}

	function getInitialNames(): { firstName: string; lastName: string } {
		return {
			firstName: customer.firstName ?? "",
			lastName: customer.lastName ?? "",
		};
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={!isLinked || anyPending}
						title={
							isLinked
								? "iRadius actions"
								: "Customer not linked to iRadius"
						}
					>
						<ZapIcon className="mr-2 size-4" />
						iRadius Actions
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuLabel>Apply in iRadius</DropdownMenuLabel>
					<DropdownMenuSeparator />
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
								...getInitialNames(),
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
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Reset MAC confirm */}
			<Dialog
				open={dialog.kind === "reset-mac"}
				onOpenChange={(o) => !o && close()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reset MAC address?</DialogTitle>
						<DialogDescription>
							This clears the stored MAC address in iRadius. The
							customer's next connection will automatically
							re-learn a new one. No disconnection is forced.
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
									{
										organizationId,
										customerId: customer.id,
									},
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

			{/* Update name dialog */}
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

			{/* Set discount dialog */}
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

			{/* Set IPTV price dialog */}
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
		</>
	);
}
