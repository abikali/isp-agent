"use client";

import { useCustomerGroups } from "@saas/billing/client";
import { useEmployeesQuery } from "@saas/employees/client";
import { formatDateInput } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
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
import { useState } from "react";
import { toast } from "sonner";
import { usePlansQuery } from "../hooks/use-plans";
import {
	type useSetupRequests,
	useUpdateSetupRequest,
} from "../hooks/use-setup-requests";

type SetupRequest = ReturnType<typeof useSetupRequests>["requests"][number];

/**
 * Edit a worker-created customer before approval — legacy `adm_new.php`
 * parity: contact details, group, plan, prices, collector, discount,
 * expiry, and the first charge the worker collected.
 */
export function EditSetupRequestDialog({
	request,
	onClose,
}: {
	request: SetupRequest;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const { groups } = useCustomerGroups();
	const { plans } = usePlansQuery();
	const { employees } = useEmployeesQuery();
	const updateRequest = useUpdateSetupRequest();

	const customer = request.customer;
	const [firstName, setFirstName] = useState(customer.firstName ?? "");
	const [lastName, setLastName] = useState(customer.lastName ?? "");
	const [mobile, setMobile] = useState(customer.mobile ?? "");
	const [address, setAddress] = useState(customer.address ?? "");
	const [groupName, setGroupName] = useState(customer.groupName ?? "");
	const [planId, setPlanId] = useState(customer.plan?.id ?? "");
	const [collectorId, setCollectorId] = useState(
		customer.collector?.id ?? "",
	);
	const [firstCharge, setFirstCharge] = useState(
		String(request.firstChargeAmount),
	);
	const [iptvPrice, setIptvPrice] = useState("");
	const [realIpPrice, setRealIpPrice] = useState("");
	const [discount, setDiscount] = useState("");
	const [expiresAt, setExpiresAt] = useState(
		customer.expiresAt ? formatDateInput(customer.expiresAt) : "",
	);

	async function handleSave() {
		if (!organizationId || !firstName.trim()) {
			return;
		}
		try {
			await updateRequest.mutateAsync({
				organizationId,
				id: request.id,
				firstName: firstName.trim(),
				lastName: lastName.trim() || null,
				mobile: mobile.trim(),
				address: address.trim(),
				groupName: groupName || null,
				...(planId ? { planId } : {}),
				collectorId: collectorId || null,
				firstChargeAmount: Number(firstCharge) || 0,
				...(iptvPrice !== "" ? { iptvPrice: Number(iptvPrice) } : {}),
				...(realIpPrice !== ""
					? { realIpPrice: Number(realIpPrice) }
					: {}),
				...(discount !== "" ? { discount: Number(discount) } : {}),
				...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
			});
			toast.success("Request updated");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update",
			);
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit Before Approval</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="esr-first">First name *</Label>
							<Input
								id="esr-first"
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="esr-last">Last name</Label>
							<Input
								id="esr-last"
								value={lastName}
								onChange={(e) => setLastName(e.target.value)}
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="esr-mobile">Mobile</Label>
							<Input
								id="esr-mobile"
								type="tel"
								value={mobile}
								onChange={(e) => setMobile(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Group</Label>
							<Select
								value={groupName || "none"}
								onValueChange={(v) =>
									setGroupName(v === "none" ? "" : v)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">None</SelectItem>
									{groups.map((group) => (
										<SelectItem key={group} value={group}>
											{group}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="esr-address">Address</Label>
						<Input
							id="esr-address"
							value={address}
							onChange={(e) => setAddress(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label>Plan</Label>
							<Select value={planId} onValueChange={setPlanId}>
								<SelectTrigger>
									<SelectValue placeholder="Pick a plan" />
								</SelectTrigger>
								<SelectContent>
									{plans
										.filter((p) => !p.archived)
										.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label>Collector</Label>
							<Select
								value={collectorId || "none"}
								onValueChange={(v) =>
									setCollectorId(v === "none" ? "" : v)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">None</SelectItem>
									{employees.map((emp) => (
										<SelectItem key={emp.id} value={emp.id}>
											{emp.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="esr-charge">First charge ($)</Label>
							<Input
								id="esr-charge"
								type="number"
								min={0}
								step="0.01"
								value={firstCharge}
								onChange={(e) => setFirstCharge(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="esr-discount">Discount ($)</Label>
							<Input
								id="esr-discount"
								type="number"
								min={0}
								step="0.01"
								value={discount}
								onChange={(e) => setDiscount(e.target.value)}
								placeholder="Keep current"
							/>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="esr-iptv">IPTV price ($)</Label>
							<Input
								id="esr-iptv"
								type="number"
								min={0}
								step="0.01"
								value={iptvPrice}
								onChange={(e) => setIptvPrice(e.target.value)}
								placeholder="Keep current"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="esr-realip">
								Real IP price ($)
							</Label>
							<Input
								id="esr-realip"
								type="number"
								min={0}
								step="0.01"
								value={realIpPrice}
								onChange={(e) => setRealIpPrice(e.target.value)}
								placeholder="Keep current"
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="esr-expiry">Expiry date</Label>
						<Input
							id="esr-expiry"
							type="date"
							value={expiresAt}
							onChange={(e) => setExpiresAt(e.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						disabled={updateRequest.isPending || !firstName.trim()}
					>
						{updateRequest.isPending ? "Saving…" : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
