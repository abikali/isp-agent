"use client";

import { getStorageImageUrl } from "@shared/lib/image-utils";
import { AudioBubble } from "./AudioBubble";
import { DocumentBubble } from "./DocumentBubble";
import { ImageBubble } from "./ImageBubble";
import { LocationBubble } from "./LocationBubble";

export function AttachmentContent({
	type,
	url: rawUrl,
	filename,
	mimeType,
	size,
	meta,
}: {
	type: string;
	url: string;
	filename?: string | null | undefined;
	mimeType?: string | null | undefined;
	size?: number | null | undefined;
	meta?: Record<string, unknown> | null | undefined;
}) {
	// Convert R2 storage paths to image-proxy URLs
	const url = getStorageImageUrl(rawUrl) ?? rawUrl;

	if (type === "image") {
		return (
			<ImageBubble
				url={url}
				caption={null}
				meta={
					meta
						? {
								width: meta.width as number | undefined,
								height: meta.height as number | undefined,
							}
						: null
				}
			/>
		);
	}
	if (type === "audio" || type === "voice") {
		return (
			<AudioBubble
				url={url}
				duration={meta?.duration as number | null | undefined}
			/>
		);
	}
	if (type === "document") {
		return (
			<DocumentBubble
				url={url}
				filename={filename}
				size={size}
				mimeType={mimeType}
			/>
		);
	}
	if (type === "location") {
		return (
			<LocationBubble
				meta={
					meta
						? {
								lat: meta.lat as number | undefined,
								lng: meta.lng as number | undefined,
							}
						: null
				}
			/>
		);
	}
	if (type === "video") {
		return (
			<video
				src={url}
				controls
				aria-label="Video attachment"
				className="max-h-64 max-w-full rounded-md"
				preload="metadata"
			>
				<track kind="captions" />
			</video>
		);
	}
	// Sticker or unknown
	if (type === "sticker") {
		return (
			<img
				src={url}
				alt="Sticker"
				loading="lazy"
				className="max-h-40 max-w-40"
			/>
		);
	}
	return null;
}
