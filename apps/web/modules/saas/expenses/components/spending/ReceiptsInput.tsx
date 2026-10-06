"use client";

import { uploadWithProgress } from "@shared/lib/upload";
import { Button } from "@ui/components/button";
import { FileTextIcon, Loader2Icon, PaperclipIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const MAX_RECEIPTS = 10;

export function isPdfUrl(url: string): boolean {
	return /\.pdf($|\?)/i.test(url);
}

/**
 * Several receipts or documents (photos or PDFs) for one expense: invoices,
 * accounting papers, warranties. Each file goes straight to R2 through a
 * signed PUT URL, like the single photo picker.
 */
export function ReceiptsInput({
	value,
	onChange,
	getUploadUrl,
}: {
	value: string[];
	onChange: (urls: string[]) => void;
	getUploadUrl: (
		file: File,
	) => Promise<{ uploadUrl: string; publicUrl: string }>;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState<string | null>(null);

	async function handleFiles(files: File[]) {
		const room = MAX_RECEIPTS - value.length;
		if (files.length > room) {
			toast.error(`Up to ${MAX_RECEIPTS} files per expense`);
		}
		let urls = value;
		for (const [i, file] of files.slice(0, room).entries()) {
			setUploading(`${i + 1}/${Math.min(files.length, room)} · 0%`);
			try {
				const { uploadUrl, publicUrl } = await getUploadUrl(file);
				await uploadWithProgress(uploadUrl, file, (p) =>
					setUploading(
						`${i + 1}/${Math.min(files.length, room)} · ${p}%`,
					),
				);
				urls = [...urls, publicUrl];
				onChange(urls);
			} catch (error) {
				toast.error(
					error instanceof Error
						? `${file.name}: ${error.message}`
						: `Could not upload ${file.name}`,
				);
			}
		}
		setUploading(null);
	}

	return (
		<div className="space-y-2">
			{value.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{value.map((url) => (
						<div key={url} className="relative">
							{isPdfUrl(url) ? (
								<a
									href={url}
									target="_blank"
									rel="noreferrer"
									className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border text-xs text-muted-foreground"
								>
									<FileTextIcon className="size-6" />
									PDF
								</a>
							) : (
								<img
									src={url}
									alt="Receipt"
									className="h-20 w-20 rounded-md border object-cover"
								/>
							)}
							<Button
								type="button"
								variant="secondary"
								size="icon"
								className="-right-2 -top-2 absolute size-6 rounded-full shadow"
								onClick={() =>
									onChange(value.filter((u) => u !== url))
								}
								aria-label="Remove file"
							>
								<XIcon className="size-3.5" />
							</Button>
						</div>
					))}
				</div>
			)}
			<input
				ref={inputRef}
				type="file"
				multiple
				accept="image/jpeg,image/png,image/webp,application/pdf"
				aria-label="Attach receipts"
				className="sr-only"
				onChange={(e) => {
					const files = Array.from(e.target.files ?? []);
					e.target.value = "";
					if (files.length > 0) {
						handleFiles(files);
					}
				}}
			/>
			{value.length < MAX_RECEIPTS && (
				<Button
					type="button"
					variant="outline"
					className="h-14 w-full border-dashed"
					disabled={uploading !== null}
					onClick={() => inputRef.current?.click()}
				>
					{uploading !== null ? (
						<span className="flex items-center gap-2 text-sm">
							<Loader2Icon className="size-4 animate-spin" />
							Uploading {uploading}
						</span>
					) : (
						<span className="flex items-center gap-2 text-sm text-muted-foreground">
							<PaperclipIcon className="size-4" />
							{value.length > 0
								? "Add more files"
								: "Attach photos or PDFs"}
						</span>
					)}
				</Button>
			)}
		</div>
	);
}
