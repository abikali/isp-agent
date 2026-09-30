"use client";

import { isUsablePin, mapViewUrl } from "@repo/utils";
import { AddPinDialog } from "@saas/billing/components/AddPinDialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { ExternalLinkIcon, MapPinPlusIcon } from "lucide-react";
import { useState } from "react";
import { formatLocationRequestAge } from "../lib/location-utils";
import { NearbyBoxesNotice } from "./NearbyBoxesNotice";

interface LocationRequestRow {
	createdAt: Date | string;
	completedAt: Date | string | null;
	expiresAt: Date | string;
}

/**
 * Pin state of a new-customer request: did the worker drop a pin (map link),
 * or ask the customer for it on WhatsApp (and did they answer)? Plus a way
 * to set the pin, and the nearby fiber-box warning once there is one.
 */
export function SetupRequestLocation({
	customer,
	pending,
}: {
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		latitude: number | null;
		longitude: number | null;
		locationRequests: LocationRequestRow[];
	};
	pending: boolean;
}) {
	const [addPinOpen, setAddPinOpen] = useState(false);
	const pinned = isUsablePin(customer.latitude, customer.longitude);
	const request = customer.locationRequests[0];
	const name =
		[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
		customer.username ||
		"Customer";

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center gap-2 text-xs">
				{pinned ? (
					<>
						<Badge variant="success">Pinned</Badge>
						<a
							href={mapViewUrl(
								Number(customer.latitude),
								Number(customer.longitude),
							)}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Open map
							<ExternalLinkIcon className="size-3" />
						</a>
					</>
				) : (
					<>
						<Badge variant="warning">No pin</Badge>
						{request ? (
							<span className="text-muted-foreground">
								{locationRequestState(request)}
							</span>
						) : null}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setAddPinOpen(true)}
						>
							<MapPinPlusIcon className="size-3.5" />
							Set pin
						</Button>
					</>
				)}
			</div>
			{pinned && pending ? (
				<NearbyBoxesNotice
					latitude={customer.latitude}
					longitude={customer.longitude}
					excludeCustomerId={customer.id}
				/>
			) : null}
			{addPinOpen && (
				<AddPinDialog
					customerId={customer.id}
					customerName={name}
					onClose={() => setAddPinOpen(false)}
				/>
			)}
		</div>
	);
}

function locationRequestState(request: LocationRequestRow): string {
	if (request.completedAt) {
		return "Customer shared a location, but it isn't usable";
	}
	if (new Date(request.expiresAt).getTime() > Date.now()) {
		return `Location requested via WhatsApp · ${formatLocationRequestAge(request.createdAt) ?? ""} (waiting)`;
	}
	return "WhatsApp location link expired";
}
