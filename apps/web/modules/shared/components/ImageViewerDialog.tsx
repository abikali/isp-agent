"use client";

import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { cn } from "@ui/lib";
import { DownloadIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import { useState } from "react";

/**
 * Full-size image viewer with zoom + download. Used for expense receipts,
 * task evidence photos, and recovered-equipment pictures.
 */
export function ImageViewerDialog({
	open,
	onOpenChange,
	src,
	title,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	src: string;
	title?: string;
}) {
	const [zoomed, setZoomed] = useState(false);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					setZoomed(false);
				}
				onOpenChange(o);
			}}
		>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<div className="flex items-center justify-between gap-2 pr-6">
						<DialogTitle>{title ?? "Photo"}</DialogTitle>
						<div className="flex gap-1">
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								onClick={() => setZoomed((z) => !z)}
								aria-label={zoomed ? "Zoom out" : "Zoom in"}
							>
								{zoomed ? (
									<ZoomOutIcon className="size-4" />
								) : (
									<ZoomInIcon className="size-4" />
								)}
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								asChild
							>
								<a
									href={src}
									download
									target="_blank"
									rel="noreferrer"
									aria-label="Download image"
								>
									<DownloadIcon className="size-4" />
								</a>
							</Button>
						</div>
					</div>
				</DialogHeader>
				<div className="max-h-[70vh] overflow-auto">
					<button
						type="button"
						className="mx-auto block"
						onClick={() => setZoomed((z) => !z)}
						aria-label={zoomed ? "Zoom out" : "Zoom in"}
					>
						<img
							src={src}
							alt={title ?? "Photo"}
							className={cn(
								"mx-auto cursor-zoom-in rounded-md transition-transform",
								zoomed && "scale-150 cursor-zoom-out",
							)}
						/>
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
