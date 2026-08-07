"use client";

import { useEmployeesQuery } from "@saas/employees/client";
import { type PhoneRow, PhoneRows } from "@shared/components/PhoneRows";
import { formatDateInput } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
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
import { useIRadiusGroups } from "../hooks/use-customers";
import { usePlansQuery } from "../hooks/use-plans";
import {
	useCheckIradiusUsername,
	type useSetupRequests,
	useUpdateSetupRequest,
} from "../hooks/use-setup-requests";

type SetupRequest = ReturnType<typeof useSetupRequests>["requests"][number];

/**
 * Edit a worker-created customer before approval — legacy `adm_new.php`
 * parity: contact details, group, plan, prices, collector, discount,
 * expiry, and the first charge the worker collected.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- legacy adm_new.php parity form; the fields are one cohesive edit surface and splitting would scatter tightly-coupled state
export function EditSetupRequestDialog({
	request,
	onClose,
}: {
	request: SetupRequest;
	onClose: () => void;
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- flat list of independent editable form fields seeded from the request, not a related state machine
}) {
	const organizationId = useOrganizationId();
	const { groups } = useIRadiusGroups();
	const { plans } = usePlansQuery();
	const { employees } = useEmployeesQuery();
	const updateRequest = useUpdateSetupRequest();

	const customer = request.customer;
	const [firstName, setFirstName] = useState(customer.firstName ?? "");
	const [lastName, setLastName] = useState(customer.lastName ?? "");
	const [username, setUsername] = useState(customer.username ?? "");
	// Value the iRadius availability check runs against — set on blur, not on
	// every keystroke, so we don't hammer the SSH tunnel as the admin types.
	const [usernameToCheck, setUsernameToCheck] = useState("");
	const [phones, setPhones] = useState<PhoneRow[]>(() => {
		const raw = Array.isArray(customer.phones)
			? (customer.phones as Array<{
					number?: unknown;
					primary?: unknown;
				}>)
			: [];
		const rows = raw.flatMap((p, i) =>
			typeof p?.number === "string"
				? [
						{
							id: `phone-${i}`,
							number: p.number,
							primary: p.primary === true,
						},
					]
				: [],
		);
		if (rows.length === 0) {
			return [
				{ id: "phone-0", number: customer.mobile ?? "", primary: true },
			];
		}
		if (!rows.some((r) => r.primary) && rows[0]) {
			rows[0].primary = true;
		}
		return rows;
	});
	const [address, setAddress] = useState(customer.address ?? "");
	// Track the selected iRadius UserGroupId (FK) — the mirror layer keys off
	// this, not the name. Seeded from the customer's current FK.
	const [groupExternalId, setGroupExternalId] = useState(
		customer.groupExternalId != null
			? String(customer.groupExternalId)
			: "",
	);
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

	const usernameCheck = useCheckIradiusUsername(usernameToCheck);
	const trimmedUsername = username.trim();
	// The check result only applies while the input still matches what we sent.
	const usernameChecked =
		usernameToCheck !== "" && usernameToCheck === trimmedUsername;
	const usernameChecking = usernameChecked && usernameCheck.isFetching;
	const usernameTaken =
		usernameChecked &&
		!usernameCheck.isFetching &&
		usernameCheck.data?.available === false;
	const usernameAvailable =
		usernameChecked &&
		!usernameCheck.isFetching &&
		usernameCheck.data?.available === true;

	async function handleSave() {
		if (
			!organizationId ||
			!firstName.trim() ||
			!trimmedUsername ||
			usernameTaken
		) {
			return;
		}
		// Single pass: drop empty numbers and trim in one iteration.
		const cleanedPhones = phones.flatMap((p) => {
			const number = p.number.trim();
			return number !== "" ? [{ number, primary: p.primary }] : [];
		});
		if (!cleanedPhones.some((p) => p.primary) && cleanedPhones[0]) {
			cleanedPhones[0].primary = true;
		}
		try {
			await updateRequest.mutateAsync({
				organizationId,
				id: request.id,
				firstName: firstName.trim(),
				lastName: lastName.trim() || null,
				...(trimmedUsername ? { username: trimmedUsername } : {}),
				...(cleanedPhones.length > 0 ? { phones: cleanedPhones } : {}),
				address: address.trim(),
				groupName: groupExternalId
					? (groups.find((g) => String(g.id) === groupExternalId)
							?.name ??
						customer.groupName ??
						null)
					: null,
				groupExternalId: groupExternalId
					? Number(groupExternalId)
					: null,
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
					<div className="space-y-1.5">
						<Label htmlFor="esr-username">
							Username (iRadius) *
						</Label>
						<Input
							id="esr-username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							onBlur={() => setUsernameToCheck(username.trim())}
							aria-invalid={usernameTaken || undefined}
							placeholder="iRadius login username"
						/>
						{usernameChecking && (
							<p className="text-muted-foreground text-xs">
								Checking availability on iRadius…
							</p>
						)}
						{usernameTaken && (
							<p className="text-destructive text-xs">
								Already exists on iRadius — pick another
								username
							</p>
						)}
						{usernameAvailable && (
							<p className="text-xs text-emerald-600">
								Available on iRadius
							</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label>Phone numbers</Label>
						<PhoneRows phones={phones} onChange={setPhones} />
					</div>
					<div className="space-y-1.5">
						<Label>Group</Label>
						{/* Combobox (not Radix Select) so the trigger label
						    resolves from `options` on every render — iRadius
						    groups load slowly over SSH and a Select would latch
						    its label empty before the matching item arrives. */}
						<Combobox
							value={groupExternalId || "none"}
							onChange={(v) =>
								setGroupExternalId(v === "none" ? "" : v)
							}
							placeholder="None"
							searchPlaceholder="Search groups…"
							emptyText="No groups found"
							options={[
								{ value: "none", label: "None" },
								...groups.map((group) => ({
									value: String(group.id),
									label: group.name,
								})),
							]}
						/>
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
									{plans.flatMap((p) =>
										p.archived
											? []
											: [
													<SelectItem
														key={p.id}
														value={p.id}
													>
														{p.name}
													</SelectItem>,
												],
									)}
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
						disabled={
							updateRequest.isPending ||
							!firstName.trim() ||
							!trimmedUsername ||
							usernameChecking ||
							usernameTaken
						}
					>
						{updateRequest.isPending ? "Saving…" : "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
