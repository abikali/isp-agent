"use client";

import { PermissionGate } from "@shared/components/PermissionGate";
import { useOrganizationId } from "@shared/lib/organization";
import { Switch } from "@ui/components/switch";
import { toast } from "sonner";
import { useSetApElectrical } from "../hooks/use-customers";

/**
 * "AP electrical" — the customer powers our access point. Editable by anyone
 * who can update customers; written to iRadius (UserNas.APElectrical) first
 * for a linked customer.
 */
export function ApElectricalToggle({
	customerId,
	value,
}: {
	customerId: string;
	value: boolean;
}) {
	const organizationId = useOrganizationId();
	const setApElectrical = useSetApElectrical();

	return (
		<PermissionGate
			resource="customers"
			action="update"
			fallback={value ? "Yes" : "No"}
		>
			<Switch
				checked={value}
				disabled={setApElectrical.isPending || !organizationId}
				aria-label="AP electrical"
				onCheckedChange={(checked) => {
					if (!organizationId) {
						return;
					}
					setApElectrical.mutate(
						{ organizationId, customerId, value: checked },
						{
							onSuccess: () =>
								toast.success(
									checked
										? "AP electrical turned on"
										: "AP electrical turned off",
								),
							onError: (error) => toast.error(error.message),
						},
					);
				}}
			/>
		</PermissionGate>
	);
}
