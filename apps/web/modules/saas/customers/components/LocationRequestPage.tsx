"use client";

import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	CheckCircle2Icon,
	Loader2Icon,
	MapPinIcon,
	XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Public customer-facing page where a customer shares their GPS location
 * via a tokenized link. No auth required. Used for the "request location"
 * flow when the collector doesn't know where the customer lives.
 */
export function LocationRequestPage({ token }: { token: string }) {
	const lookup = useQuery(
		orpc.customers.getLocationRequestByToken.queryOptions({
			input: { token },
		}),
	);
	const submit = useMutation({
		...orpc.customers.submitLocationByToken.mutationOptions(),
	});
	const [submitted, setSubmitted] = useState(false);
	const [busy, setBusy] = useState(false);

	if (lookup.isLoading) {
		return (
			<Centered>
				<Loader2Icon className="size-8 animate-spin text-muted-foreground" />
			</Centered>
		);
	}

	if (lookup.isError || !lookup.data) {
		return (
			<Centered>
				<Card className="max-w-sm">
					<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
						<XCircleIcon className="size-12 text-destructive" />
						<h1 className="text-lg font-semibold">Invalid link</h1>
						<p className="text-sm text-muted-foreground">
							This location-share link is not valid. Please ask
							your provider to send you a new one.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	if (lookup.data.completed || submitted) {
		return (
			<Centered>
				<Card className="max-w-sm">
					<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
						<CheckCircle2Icon className="size-12 text-emerald-500" />
						<h1 className="text-lg font-semibold">Thank you!</h1>
						<p className="text-sm text-muted-foreground">
							Your location has been shared. You can close this
							page.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	if (lookup.data.expired) {
		return (
			<Centered>
				<Card className="max-w-sm">
					<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
						<XCircleIcon className="size-12 text-destructive" />
						<h1 className="text-lg font-semibold">Link expired</h1>
						<p className="text-sm text-muted-foreground">
							This link has expired. Please ask your provider to
							send you a new one.
						</p>
					</CardContent>
				</Card>
			</Centered>
		);
	}

	function shareLocation() {
		if (!navigator.geolocation) {
			toast.error("Your browser does not support geolocation");
			return;
		}
		setBusy(true);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				submit.mutate(
					{
						token,
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
					},
					{
						onSuccess: () => {
							setSubmitted(true);
							setBusy(false);
						},
						onError: (err) => {
							toast.error(err.message);
							setBusy(false);
						},
					},
				);
			},
			(err) => {
				setBusy(false);
				toast.error(
					err.code === err.PERMISSION_DENIED
						? "Please allow location access in your browser"
						: "Could not get your location",
				);
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
		);
	}

	const greeting = lookup.data.customerFirstName
		? `Hi ${lookup.data.customerFirstName}!`
		: "Hi!";

	return (
		<Centered>
			<Card className="w-full max-w-sm">
				<CardContent className="flex flex-col items-center gap-4 py-10 text-center">
					<MapPinIcon className="size-12 text-primary" />
					<div>
						<h1 className="text-xl font-semibold">{greeting}</h1>
						<p className="mt-2 text-sm text-muted-foreground">
							Your internet provider needs your location so they
							can serve you better. Tap the button below to share
							your current GPS location.
						</p>
					</div>
					<Button
						size="lg"
						className="w-full"
						disabled={busy || submit.isPending}
						onClick={shareLocation}
					>
						{busy || submit.isPending ? (
							<>
								<Loader2Icon className="mr-2 size-4 animate-spin" />
								Sharing…
							</>
						) : (
							<>
								<MapPinIcon className="mr-2 size-4" />
								Share my location
							</>
						)}
					</Button>
					<p className="text-xs text-muted-foreground">
						Your location is only shared with your internet
						provider.
					</p>
				</CardContent>
			</Card>
		</Centered>
	);
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
			{children}
		</div>
	);
}
