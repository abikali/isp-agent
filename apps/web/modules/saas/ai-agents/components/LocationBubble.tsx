"use client";

import { MapPinIcon } from "lucide-react";

interface LocationBubbleProps {
	meta?: { lat?: number; lng?: number } | null | undefined;
}

export function LocationBubble({ meta }: LocationBubbleProps) {
	const lat = meta?.lat;
	const lng = meta?.lng;

	if (lat === undefined || lng === undefined) {
		return (
			<div className="flex items-center gap-2 rounded-md bg-background/50 p-2">
				<MapPinIcon className="size-5 text-muted-foreground" />
				<span className="text-sm text-muted-foreground">
					Location shared
				</span>
			</div>
		);
	}

	const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

	return (
		<a
			href={mapsUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="block rounded-md bg-background/50 p-2 transition-colors hover:bg-background/80"
		>
			<div className="flex items-center gap-2">
				<MapPinIcon className="size-5 text-primary" />
				<div>
					<p className="text-sm font-medium">Location</p>
					<p className="text-[10px] text-muted-foreground">
						{lat.toFixed(6)}, {lng.toFixed(6)}
					</p>
				</div>
			</div>
			<p className="mt-1 text-[10px] text-primary">Open in Google Maps</p>
		</a>
	);
}
