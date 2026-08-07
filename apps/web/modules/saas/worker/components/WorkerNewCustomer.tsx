"use client";

import { type PhoneRow, PhoneRows } from "@shared/components/PhoneRows";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Checkbox } from "@ui/components/checkbox";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import { CheckIcon, CrosshairIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useMyStatsQuery,
	useWorkerCreateCustomer,
	useWorkerCreateOptions,
} from "../hooks/use-worker";
import { InstallItemRows } from "./InstallItemRows";
import {
	type InstallLine,
	installLinesTotal,
	linesToPayload,
} from "./install-lines";
import { StatStrip } from "./WorkerUI";

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			{children}
		</p>
	);
}

function LocationField({
	latitude,
	longitude,
	onCoords,
	requestWhatsapp,
	onRequestWhatsapp,
}: {
	latitude: string;
	longitude: string;
	onCoords: (lat: string, lng: string) => void;
	requestWhatsapp: boolean;
	onRequestWhatsapp: (v: boolean) => void;
}) {
	const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

	function useCurrentLocation() {
		if (typeof navigator === "undefined" || !navigator.geolocation) {
			setStatus("error");
			toast.error("Location is not supported on this device");
			return;
		}
		setStatus("loading");
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setStatus("idle");
				onCoords(
					String(pos.coords.latitude),
					String(pos.coords.longitude),
				);
			},
			() => {
				setStatus("error");
				toast.error("Couldn't get your location — enter it manually");
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
		);
	}

	const hasCoords = latitude.trim() !== "" && longitude.trim() !== "";

	return (
		<div className="space-y-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="w-full"
				onClick={useCurrentLocation}
				disabled={status === "loading"}
			>
				{status === "loading" ? (
					<LoaderIcon className="mr-2 size-4 animate-spin" />
				) : (
					<CrosshairIcon className="mr-2 size-4" />
				)}
				Use my current location
			</Button>
			<div className="grid grid-cols-2 gap-2">
				<Input
					type="number"
					step="any"
					inputMode="decimal"
					value={latitude}
					onChange={(e) => onCoords(e.target.value, longitude)}
					placeholder="Latitude"
				/>
				<Input
					type="number"
					step="any"
					inputMode="decimal"
					value={longitude}
					onChange={(e) => onCoords(latitude, e.target.value)}
					placeholder="Longitude"
				/>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id="nc-wa-location"
					checked={requestWhatsapp}
					onCheckedChange={(v) => onRequestWhatsapp(v === true)}
					disabled={hasCoords}
				/>
				<Label
					htmlFor="nc-wa-location"
					className="text-sm font-normal text-muted-foreground"
				>
					Ask the customer for their location on WhatsApp
				</Label>
			</div>
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent form-field slices; a reducer would add ceremony without grouping related transitions
// react-doctor-disable-next-line react-doctor/no-giant-component -- cohesive new-customer intake form; the field state and summary/submit flow are one unit, splitting would scatter shared state
export function WorkerNewCustomer() {
	const organizationId = useOrganizationId();
	const { plans, collectors, groups } = useWorkerCreateOptions();
	const { stats, isLoading: statsLoading } = useMyStatsQuery();
	const createCustomer = useWorkerCreateCustomer();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [phones, setPhones] = useState<PhoneRow[]>([
		{ id: "phone-0", number: "", primary: true },
	]);
	const [address, setAddress] = useState("");
	const [groupName, setGroupName] = useState("");
	const [latitude, setLatitude] = useState("");
	const [longitude, setLongitude] = useState("");
	const [requestWhatsapp, setRequestWhatsapp] = useState(false);
	const [collectorId, setCollectorId] = useState("");
	const [planId, setPlanId] = useState("");
	const [durationType, setDurationType] = useState<"month" | "days">("month");
	const [durationDays, setDurationDays] = useState("15");
	const [note, setNote] = useState("");
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

	const hasValidPhone = phones.some(
		(p) => p.number.replace(/\D/g, "").length >= 7,
	);
	const valid =
		firstName.trim() &&
		hasValidPhone &&
		address.trim() &&
		planId &&
		(durationType === "month" || Number(durationDays) >= 1);

	function reset() {
		setFirstName("");
		setLastName("");
		setPhones([{ id: "phone-0", number: "", primary: true }]);
		setAddress("");
		setGroupName("");
		setLatitude("");
		setLongitude("");
		setRequestWhatsapp(false);
		setCollectorId("");
		setPlanId("");
		setDurationType("month");
		setDurationDays("15");
		setNote("");
		setLines([]);
	}

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		const cleanedPhones = phones.flatMap((p) => {
			const number = p.number.trim();
			return number === "" ? [] : [{ number, primary: p.primary }];
		});
		// Keep exactly one primary even if the primary row was left blank.
		if (!cleanedPhones.some((p) => p.primary) && cleanedPhones[0]) {
			cleanedPhones[0].primary = true;
		}

		const lat = Number.parseFloat(latitude);
		const lng = Number.parseFloat(longitude);
		const hasCoords =
			Number.isFinite(lat) &&
			lat >= -90 &&
			lat <= 90 &&
			Number.isFinite(lng) &&
			lng >= -180 &&
			lng <= 180;

		try {
			await createCustomer.mutateAsync({
				organizationId,
				firstName: firstName.trim(),
				lastName: lastName.trim() || undefined,
				phones: cleanedPhones,
				address: address.trim(),
				groupName: groupName.trim() || undefined,
				// Pass the iRadius UserGroupId (FK) straight from the selected
				// option — the mirror layer keys off this, not the name.
				groupExternalId: groupName
					? (groups.find((g) => g.name === groupName)?.externalId ??
						undefined)
					: undefined,
				...(hasCoords ? { latitude: lat, longitude: lng } : {}),
				requestLocationViaWhatsapp:
					!hasCoords && requestWhatsapp ? true : undefined,
				collectorId: collectorId || undefined,
				planId,
				durationType,
				durationDays:
					durationType === "days" ? Number(durationDays) : undefined,
				notes: note.trim() || undefined,
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
			<StatStrip
				items={[
					{
						label: "Created (mo)",
						value: String(stats?.customers.createdThisMonth ?? 0),
					},
					{
						label: "Pending approval",
						value: String(stats?.customers.pendingApproval ?? 0),
					},
				]}
				isLoading={statsLoading}
			/>

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
					<Label>Phone numbers *</Label>
					<PhoneRows phones={phones} onChange={setPhones} />
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
									value: group.name,
									label: group.name,
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
				<div className="space-y-1.5">
					<Label>Location</Label>
					<LocationField
						latitude={latitude}
						longitude={longitude}
						onCoords={(lat, lng) => {
							setLatitude(lat);
							setLongitude(lng);
						}}
						requestWhatsapp={requestWhatsapp}
						onRequestWhatsapp={setRequestWhatsapp}
					/>
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

			{/* Note */}
			<div className="space-y-3">
				<SectionTitle>Note (optional)</SectionTitle>
				<Textarea
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder="Anything the admin should know before approving…"
					rows={3}
					maxLength={2000}
				/>
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
