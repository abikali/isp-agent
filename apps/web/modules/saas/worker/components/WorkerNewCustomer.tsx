"use client";

import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PhoneInput } from "@ui/components/phone-input";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { CheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useWorkerCreateCustomer,
	useWorkerCreateOptions,
} from "../hooks/use-worker";
import { InstallItemRows } from "./InstallItemRows";
import {
	type InstallLine,
	installLinesTotal,
	linesToPayload,
} from "./install-lines";

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			{children}
		</p>
	);
}

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field slices; a reducer would add ceremony without grouping related transitions
export function WorkerNewCustomer() {
	const organizationId = useOrganizationId();
	const { plans, collectors, groups } = useWorkerCreateOptions();
	const createCustomer = useWorkerCreateCustomer();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [mobile, setMobile] = useState("");
	const [address, setAddress] = useState("");
	const [groupName, setGroupName] = useState("");
	const [collectorId, setCollectorId] = useState("");
	const [planId, setPlanId] = useState("");
	const [durationType, setDurationType] = useState<"month" | "days">("month");
	const [durationDays, setDurationDays] = useState("15");
	const [lines, setLines] = useState<InstallLine[]>([]);

	const plan = plans.find((p) => p.id === planId);
	const firstCharge = plan
		? durationType === "month"
			? plan.monthlyPrice
			: (plan.monthlyPrice / 30) * Number(durationDays || 0)
		: 0;
	const itemsTotal = installLinesTotal(lines);

	const nextBilling = (() => {
		const d = new Date();
		if (durationType === "month") {
			d.setMonth(d.getMonth() + 1);
		} else {
			d.setDate(d.getDate() + Number(durationDays || 0));
		}
		return d;
	})();

	const mobileDigits = mobile.replace(/\D/g, "").length;
	const valid =
		firstName.trim() &&
		mobileDigits >= 7 &&
		address.trim() &&
		planId &&
		(durationType === "month" || Number(durationDays) >= 1);

	function reset() {
		setFirstName("");
		setLastName("");
		setMobile("");
		setAddress("");
		setGroupName("");
		setCollectorId("");
		setPlanId("");
		setDurationType("month");
		setDurationDays("15");
		setLines([]);
	}

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		try {
			await createCustomer.mutateAsync({
				organizationId,
				firstName: firstName.trim(),
				lastName: lastName.trim() || undefined,
				mobile: mobile.trim(),
				address: address.trim(),
				groupName: groupName.trim() || undefined,
				collectorId: collectorId || undefined,
				planId,
				durationType,
				durationDays:
					durationType === "days" ? Number(durationDays) : undefined,
				items: linesToPayload(lines),
			});
			toast.success("Customer submitted for approval");
			reset();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<div className="space-y-6 pb-4">
			{/* Customer */}
			<div className="space-y-3">
				<SectionTitle>Customer</SectionTitle>
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1.5">
						<Label htmlFor="nc-first">First name *</Label>
						<Input
							id="nc-first"
							value={firstName}
							onChange={(e) => setFirstName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="nc-last">Last name</Label>
						<Input
							id="nc-last"
							value={lastName}
							onChange={(e) => setLastName(e.target.value)}
						/>
					</div>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="nc-mobile">Mobile *</Label>
					<PhoneInput
						value={mobile}
						onChange={setMobile}
						placeholder="Mobile number"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="nc-address">Address *</Label>
					<Input
						id="nc-address"
						value={address}
						onChange={(e) => setAddress(e.target.value)}
					/>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1.5">
						<Label>Area</Label>
						<Combobox
							value={groupName}
							onChange={setGroupName}
							placeholder="None"
							searchPlaceholder="Search areas…"
							options={[
								{ value: "", label: "None" },
								...groups.map((group) => ({
									value: group,
									label: group,
								})),
							]}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Collector</Label>
						<Combobox
							value={collectorId}
							onChange={setCollectorId}
							placeholder="Optional"
							searchPlaceholder="Search collectors…"
							options={[
								{ value: "", label: "None" },
								...collectors.map((emp) => ({
									value: emp.id,
									label: emp.name,
								})),
							]}
						/>
					</div>
				</div>
			</div>

			{/* Plan & duration */}
			<div className="space-y-3">
				<SectionTitle>Plan &amp; duration</SectionTitle>
				<div className="space-y-1.5">
					<Label>Plan *</Label>
					<Combobox
						value={planId}
						onChange={setPlanId}
						placeholder="Pick a plan"
						searchPlaceholder="Search plans…"
						options={plans.map((p) => ({
							value: p.id,
							label: `${p.name} — ${formatCurrency(p.monthlyPrice)}/mo`,
						}))}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Duration</Label>
					<Tabs
						value={durationType}
						onValueChange={(v) =>
							setDurationType(v as "month" | "days")
						}
					>
						<TabsList className="w-full">
							<TabsTrigger value="month" className="flex-1">
								Full month
							</TabsTrigger>
							<TabsTrigger value="days" className="flex-1">
								Custom days
							</TabsTrigger>
						</TabsList>
					</Tabs>
					{durationType === "days" && (
						<Input
							type="number"
							inputMode="numeric"
							min={1}
							max={120}
							value={durationDays}
							onChange={(e) => setDurationDays(e.target.value)}
							placeholder="Number of days"
						/>
					)}
				</div>
			</div>

			{/* Items */}
			<div className="space-y-3">
				<SectionTitle>Items &amp; add-ons (optional)</SectionTitle>
				<InstallItemRows lines={lines} onChange={setLines} />
			</div>

			{/* Summary */}
			{plan && (
				<Card>
					<CardContent className="space-y-2 p-4 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								First charge
							</span>
							<span className="font-mono font-medium tabular-nums">
								{formatCurrency(firstCharge)}
							</span>
						</div>
						{lines.length > 0 && (
							<div className="flex justify-between">
								<span className="text-muted-foreground">
									Items &amp; add-ons
								</span>
								<span className="font-mono tabular-nums">
									{formatCurrency(itemsTotal)}
								</span>
							</div>
						)}
						<div className="flex justify-between">
							<span className="text-muted-foreground">
								Next billing
							</span>
							<span className="tabular-nums">
								{formatDate(nextBilling, {
									dateStyle: "medium",
								})}
							</span>
						</div>
						<div className="flex justify-between border-t pt-2 font-medium">
							<span>Total to collect</span>
							<span className="font-mono tabular-nums">
								{formatCurrency(firstCharge + itemsTotal)}
							</span>
						</div>
					</CardContent>
				</Card>
			)}

			<Button
				className="w-full"
				size="lg"
				onClick={handleSubmit}
				disabled={!valid || createCustomer.isPending}
			>
				{createCustomer.isPending ? (
					"Submitting…"
				) : (
					<>
						<CheckIcon className="mr-2 size-4" />
						Submit customer
					</>
				)}
			</Button>
		</div>
	);
}
