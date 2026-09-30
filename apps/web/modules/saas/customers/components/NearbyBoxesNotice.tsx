"use client";

import { isUsablePin } from "@repo/utils";
import { FIELD_LABELS } from "@saas/worker/lib/labels";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon } from "lucide-react";

/** A box already serving this many customers gets the warning. */
const WARN_AT = 2;

/**
 * "This fiber box already has N customers" — shown when placing a customer
 * near an ONU that already serves several, so the installer can pick another
 * box (if it dies, everyone on it goes down). Warn-only, never blocks.
 * `bilingual` switches the copy for the worker portal.
 */
export function NearbyBoxesNotice({
	latitude,
	longitude,
	excludeCustomerId,
	bilingual = false,
}: {
	latitude: number | null | undefined;
	longitude: number | null | undefined;
	excludeCustomerId?: string | undefined;
	bilingual?: boolean;
}) {
	const organizationId = useOrganizationId();
	const pinned = isUsablePin(latitude, longitude);
	const { data } = useQuery(
		organizationId && pinned
			? orpc.customers.nearbyBoxes.queryOptions({
					input: {
						organizationId,
						latitude: Number(latitude),
						longitude: Number(longitude),
						excludeCustomerId,
					},
				})
			: disabledQuery(["customers", "nearbyBoxes", latitude, longitude]),
	);
	const boxes = (data?.boxes ?? []).filter((b) => b.total >= WARN_AT);
	if (boxes.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
			{boxes.map((box) => (
				<div key={box.interface}>
					<p className="flex items-start gap-1.5 font-medium text-warning">
						<AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
						<span>
							{bilingual
								? FIELD_LABELS.boxHasCustomers.replaceAll(
										"{n}",
										String(box.total),
									)
								: `Nearby fiber box already has ${box.total} customers`}
							{": "}
							<span className="font-mono text-xs">
								{box.shortName}
							</span>
						</span>
					</p>
					<p className="mt-1 text-muted-foreground text-xs">
						{box.customers
							.map((c) =>
								c.distanceM !== null
									? `${c.username ?? c.name} (${c.distanceM} m)`
									: (c.username ?? c.name),
							)
							.join(", ")}
						{box.total > box.customers.length ? ", …" : ""}
					</p>
				</div>
			))}
			<p className="text-muted-foreground text-xs">
				{bilingual
					? FIELD_LABELS.nearbyBoxHint
					: "Pick another box if possible — if it fails they all go down."}
			</p>
		</div>
	);
}

/** The same warning for an existing customer, from their saved pin. */
export function CustomerNearbyBoxesNotice({
	customerId,
}: {
	customerId: string;
}) {
	const organizationId = useOrganizationId();
	const { data } = useQuery(
		organizationId
			? orpc.customers.get.queryOptions({
					input: { organizationId, id: customerId },
				})
			: disabledQuery(["customers", "get", customerId]),
	);
	return (
		<NearbyBoxesNotice
			latitude={data?.customer.latitude}
			longitude={data?.customer.longitude}
			excludeCustomerId={customerId}
		/>
	);
}
