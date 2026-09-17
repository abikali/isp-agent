"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { toast } from "sonner";
import {
	useCreateBillingLocationRequest,
	useSaveBillingLocation,
} from "../hooks/use-billing";
import { LocationPromptDialog } from "./LocationPromptDialog";

/**
 * "Add pin" from a collector card: capture the pin at the door (or ask the
 * customer for it on WhatsApp) without having to record a payment first.
 * Render only while open — the prompt keeps its own geolocation state.
 */
export function AddPinDialog({
	customerId,
	customerName,
	onClose,
}: {
	customerId: string;
	customerName: string;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const saveLocation = useSaveBillingLocation();
	const createLocationRequest = useCreateBillingLocationRequest();

	return (
		<LocationPromptDialog
			open
			customerName={customerName}
			skipLabel="Cancel"
			onSkip={onClose}
			onConfirm={(latitude, longitude) => {
				if (!organizationId) {
					return;
				}
				saveLocation.mutate(
					{ organizationId, customerId, latitude, longitude },
					{
						onSuccess: () => {
							toast.success("Location saved");
							onClose();
						},
						onError: (error) => {
							toast.error(error.message);
							onClose();
						},
					},
				);
			}}
			whatsappPending={createLocationRequest.isPending}
			onSendWhatsapp={() => {
				if (!organizationId) {
					return;
				}
				createLocationRequest.mutate(
					{ organizationId, customerId },
					{
						onSuccess: (data) => {
							if (data.whatsappSent) {
								toast.success(
									"Location request sent to customer on WhatsApp",
								);
							} else {
								toast.warning(
									"Location request created, but WhatsApp delivery failed",
								);
							}
							onClose();
						},
						onError: (error) => {
							toast.error(error.message);
						},
					},
				);
			}}
		/>
	);
}
