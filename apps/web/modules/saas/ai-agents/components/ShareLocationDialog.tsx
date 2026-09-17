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
import { Field, FieldDescription, FieldLabel } from "@ui/components/field";
import { Input } from "@ui/components/input";
import { LoaderIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { parseCoordinates } from "../lib/chat-utils";

/**
 * Send a location pin into the chat from pasted coordinates or a Google Maps
 * link. Mounted only while open.
 */
export function ShareLocationDialog({
	onSend,
	onClose,
	isSending,
}: {
	onSend: (location: { latitude: number; longitude: number }) => void;
	onClose: () => void;
	isSending: boolean;
}) {
	const [text, setText] = useState("");
	const location = parseCoordinates(text);
	const showError = text.trim().length > 0 && !location;

	function handleSend() {
		if (location && !isSending) {
			onSend(location);
		}
	}

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Send a location</DialogTitle>
					<DialogDescription>
						Sends a map pin the customer can open for directions.
					</DialogDescription>
				</DialogHeader>

				<Field data-invalid={showError || undefined}>
					<FieldLabel htmlFor="share-location-input">
						Coordinates or Google Maps link
					</FieldLabel>
					<Input
						id="share-location-input"
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="33.8938, 35.5018"
						aria-invalid={showError || undefined}
						autoFocus
					/>
					<FieldDescription>
						{showError
							? "No coordinates found. Short maps.app.goo.gl links don't include them — open the link and copy the full URL, or copy the coordinates from the pin."
							: location
								? `Pin at ${location.latitude}, ${location.longitude}`
								: "Paste “lat, lng” or a full google.com/maps link."}
					</FieldDescription>
				</Field>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSend}
						disabled={!location || isSending}
					>
						{isSending ? (
							<LoaderIcon className="size-4 animate-spin" />
						) : (
							<SendIcon className="size-4" />
						)}
						Send location
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
