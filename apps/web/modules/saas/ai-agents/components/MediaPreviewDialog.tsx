"use client";

import { Button } from "@ui/components/button";
import { Dialog, DialogContent, DialogFooter } from "@ui/components/dialog";
import { cn } from "@ui/lib";
import { FileTextIcon, SendIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface MediaPreviewDialogProps {
	file: File | null;
	onSend: (file: File, caption: string) => void;
	onClose: () => void;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPreviewDialog({
	file,
	onSend,
	onClose,
}: MediaPreviewDialogProps) {
	const [caption, setCaption] = useState("");
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const captionRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (!file) {
			setCaption("");
			setPreviewUrl(null);
			return undefined;
		}

		// Auto-focus caption input
		setTimeout(() => captionRef.current?.focus(), 100);

		// Generate preview URL for images/videos
		if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
			const url = URL.createObjectURL(file);
			setPreviewUrl(url);
			return () => URL.revokeObjectURL(url);
		}

		setPreviewUrl(null);
		return undefined;
	}, [file]);

	if (!file) {
		return null;
	}

	const isImage = file.type.startsWith("image/");
	const isVideo = file.type.startsWith("video/");

	function handleSend() {
		if (file) {
			onSend(file, caption.trim());
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
		if (e.key === "Escape") {
			onClose();
		}
	}

	return (
		<Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="flex max-h-[90dvh] max-w-lg flex-col gap-0 overflow-hidden p-0"
				showCloseButton={false}
				accessibleTitle="Send media"
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b px-4 py-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-full p-1 text-muted-foreground hover:bg-muted"
					>
						<XIcon className="size-5" />
					</button>
					<span className="text-sm font-medium">
						{isImage
							? "Send Photo"
							: isVideo
								? "Send Video"
								: "Send File"}
					</span>
					<div className="w-7" />
				</div>

				{/* Preview area */}
				<div className="flex flex-1 items-center justify-center overflow-hidden bg-black/5 dark:bg-black/20">
					{isImage && previewUrl && (
						<img
							src={previewUrl}
							alt="Preview"
							className="max-h-[50dvh] max-w-full object-contain"
						/>
					)}
					{isVideo && previewUrl && (
						<video
							src={previewUrl}
							controls
							className="max-h-[50dvh] max-w-full"
						>
							<track kind="captions" />
						</video>
					)}
					{!isImage && !isVideo && (
						<div className="flex flex-col items-center gap-3 p-10">
							<div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
								<FileTextIcon className="size-8 text-primary" />
							</div>
							<div className="text-center">
								<p className="text-sm font-medium">
									{file.name}
								</p>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{formatFileSize(file.size)}
								</p>
							</div>
						</div>
					)}
				</div>

				{/* Caption + Send */}
				<DialogFooter className="border-t p-0">
					<div className="flex w-full items-end gap-2 px-3 py-2">
						<textarea
							ref={captionRef}
							value={caption}
							onChange={(e) => setCaption(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Add a caption..."
							rows={1}
							className={cn(
								"flex-1 resize-none rounded-2xl border border-input bg-muted/40 px-4 py-2 text-sm leading-relaxed",
								"placeholder:text-muted-foreground/50",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								"max-h-24 min-h-[38px]",
							)}
						/>
						<Button
							onClick={handleSend}
							size="icon"
							className="size-9 shrink-0 rounded-full"
						>
							<SendIcon className="size-4" />
							<span className="sr-only">Send</span>
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
