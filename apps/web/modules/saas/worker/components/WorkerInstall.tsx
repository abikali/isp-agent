"use client";

import { useStationsQuery } from "@saas/customers/client";
import { useCreateInstallation } from "@saas/installations/client";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { useState } from "react";
import { toast } from "sonner";
import {
	InstallItemRows,
	type InstallLine,
	linesToPayload,
} from "./InstallItemRows";

export function WorkerInstall() {
	const organizationId = useOrganizationId();
	const { stations } = useStationsQuery();
	const createInstallation = useCreateInstallation();

	const [target, setTarget] = useState<"customer" | "station">("customer");
	const [customer, setCustomer] = useState<{
		id: string;
		name: string;
		username: string | null;
	} | null>(null);
	const [stationId, setStationId] = useState("");
	const [lines, setLines] = useState<InstallLine[]>([]);

	const payload = linesToPayload(lines);
	const targetSelected =
		target === "customer" ? customer !== null : stationId !== "";
	const canSubmit = targetSelected && payload.length > 0;

	async function handleSubmit() {
		if (!organizationId || !canSubmit) {
			return;
		}
		try {
			await createInstallation.mutateAsync({
				organizationId,
				...(target === "customer"
					? { customerId: customer?.id ?? "" }
					: { stationId }),
				items: payload,
			});
			toast.success("Installation submitted for approval");
			setCustomer(null);
			setStationId("");
			setLines([]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<div className="space-y-4">
			<Tabs
				value={target}
				onValueChange={(v) => {
					setTarget(v as "customer" | "station");
					setLines((prev) =>
						v === "station"
							? prev.filter((l) => l.kind === "item")
							: prev,
					);
				}}
			>
				<TabsList className="w-full">
					<TabsTrigger value="customer" className="flex-1">
						Customer
					</TabsTrigger>
					<TabsTrigger value="station" className="flex-1">
						Station
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{target === "customer" ? (
				<div className="space-y-1.5">
					<Label>Customer</Label>
					<CustomerCombobox
						value={customer}
						onChange={setCustomer}
						placeholder="Find a customer…"
					/>
				</div>
			) : (
				<div className="space-y-1.5">
					<Label>Station</Label>
					<Select value={stationId} onValueChange={setStationId}>
						<SelectTrigger>
							<SelectValue placeholder="Pick a station" />
						</SelectTrigger>
						<SelectContent>
							{stations.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<InstallItemRows
				lines={lines}
				onChange={setLines}
				allowAddons={target === "customer"}
			/>

			<Button
				className="w-full"
				onClick={handleSubmit}
				disabled={createInstallation.isPending || !canSubmit}
			>
				{createInstallation.isPending
					? "Submitting…"
					: "Submit installation"}
			</Button>
		</div>
	);
}
