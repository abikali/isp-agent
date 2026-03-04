"use client";

import { useState } from "react";

interface ImageBubbleProps {
	url: string;
	caption?: string | null | undefined;
	meta?: { width?: number; height?: number } | null | undefined;
}

export function ImageBubble({ url, caption, meta }: ImageBubbleProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<div className="overflow-hidden rounded-md">
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					className="block"
				>
					<img
						src={url}
						alt={caption ?? "Image"}
						loading="lazy"
						className="max-h-64 max-w-full rounded-md object-cover"
						width={meta?.width}
						height={meta?.height}
					/>
				</button>
				{caption && <p className="mt-1 text-sm">{caption}</p>}
			</div>

			{/* Simple lightbox overlay */}
			{isOpen && (
				<button
					type="button"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
					onClick={() => setIsOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							setIsOpen(false);
						}
					}}
				>
					<img
						src={url}
						alt={caption ?? "Image"}
						className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
					/>
				</button>
			)}
		</>
	);
}
