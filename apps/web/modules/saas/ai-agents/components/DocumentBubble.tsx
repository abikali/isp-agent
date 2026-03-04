"use client";

import { FileIcon } from "lucide-react";

interface DocumentBubbleProps {
	url: string;
	filename?: string | null | undefined;
	size?: number | null | undefined;
	mimeType?: string | null | undefined;
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

export function DocumentBubble({
	url,
	filename,
	size,
	mimeType,
}: DocumentBubbleProps) {
	const displayName = filename ?? "Document";
	const ext = displayName.split(".").pop()?.toUpperCase() ?? "";

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="flex items-center gap-3 rounded-md bg-background/50 p-2 transition-colors hover:bg-background/80"
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
				<FileIcon className="size-5 text-primary" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{displayName}</p>
				<p className="text-[10px] text-muted-foreground">
					{ext}
					{size ? ` · ${formatFileSize(size)}` : ""}
					{mimeType && !ext ? ` · ${mimeType}` : ""}
				</p>
			</div>
		</a>
	);
}
