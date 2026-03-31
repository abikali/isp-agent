"use client";

import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { CrosshairIcon, LoaderIcon, MapPinIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface LocationPromptDialogProps {
	open: boolean;
	customerName: string;
	onConfirm: (latitude: number, longitude: number) => void;
	onSkip: () => void;
}

export function LocationPromptDialog({
	open,
	customerName,
	onConfirm,
	onSkip,
}: LocationPromptDialogProps) {
	const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
	const [errorMessage, setErrorMessage] = useState("");

	useEffect(() => {
		if (open) {
			setStatus("idle");
			setErrorMessage("");
		}
	}, [open]);

	const requestLocation = useCallback(() => {
		if (!navigator.geolocation) {
			setStatus("error");
			setErrorMessage("Location is not supported on this device");
			return;
		}

		setStatus("loading");
		setErrorMessage("");

		navigator.geolocation.getCurrentPosition(
			(position) => {
				onConfirm(position.coords.latitude, position.coords.longitude);
			},
			(error) => {
				setStatus("error");
				switch (error.code) {
					case error.PERMISSION_DENIED:
						setErrorMessage(
							"Location access denied. Please enable location permissions in your browser settings.",
						);
						break;
					case error.POSITION_UNAVAILABLE:
						setErrorMessage(
							"Unable to determine your location. Please try again.",
						);
						break;
					case error.TIMEOUT:
						setErrorMessage(
							"Location request timed out. Please try again.",
						);
						break;
					default:
						setErrorMessage(
							"Failed to get location. Please try again.",
						);
				}
			},
			{
				enableHighAccuracy: true,
				timeout: 15000,
				maximumAge: 0,
			},
		);
	}, [onConfirm]);

	return (
		<Dialog open={open}>
			<DialogContent
				showCloseButton={false}
				onInteractOutside={(e) => e.preventDefault()}
				onEscapeKeyDown={(e) => e.preventDefault()}
				className="sm:max-w-sm"
			>
				<DialogHeader className="items-center text-center">
					<div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
						<MapPinIcon className="size-6 text-primary" />
					</div>
					<DialogTitle>Save Customer Location</DialogTitle>
					<DialogDescription>
						<span className="font-semibold text-foreground">
							{customerName}
						</span>{" "}
						doesn't have a saved location. If you're at their
						location, tap below to save it for future visits.
					</DialogDescription>
				</DialogHeader>

				{status === "error" && (
					<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
						<p className="text-sm text-destructive">
							{errorMessage}
						</p>
					</div>
				)}

				<div className="flex flex-col gap-2">
					<Button
						size="lg"
						className="w-full text-base font-semibold"
						onClick={requestLocation}
						disabled={status === "loading"}
					>
						{status === "loading" ? (
							<>
								<LoaderIcon className="mr-2 size-4 animate-spin" />
								Getting location...
							</>
						) : (
							<>
								<CrosshairIcon className="mr-2 size-4" />
								{status === "error"
									? "Try Again"
									: "Use My Current Location"}
							</>
						)}
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						onClick={onSkip}
					>
						I'm not at the customer's location
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
