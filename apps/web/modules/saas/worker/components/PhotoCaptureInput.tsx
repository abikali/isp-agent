"use client";

import { uploadWithProgress } from "@shared/lib/upload";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { CameraIcon, Loader2Icon, XIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

interface UploadUrlResult {
	uploadUrl: string;
	publicUrl: string;
}

/**
 * Mobile-first photo capture: opens the camera on phones, uploads straight
 * to R2 via a signed PUT URL, and reports the image-proxy public URL.
 * The signed-URL mutation is injected so each domain (expenses, task
 * evidence) uses its own upload procedure.
 */
export function PhotoCaptureInput({
	value,
	onChange,
	getUploadUrl,
	label = "Add photo",
	className,
}: {
	value: string | null;
	onChange: (publicUrl: string | null) => void;
	getUploadUrl: (file: File) => Promise<UploadUrlResult>;
	label?: string;
	className?: string;
}) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [progress, setProgress] = useState<number | null>(null);

	async function handleFile(file: File) {
		setProgress(0);
		try {
			const { uploadUrl, publicUrl } = await getUploadUrl(file);
			await uploadWithProgress(uploadUrl, file, setProgress);
			onChange(publicUrl);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Upload failed",
			);
		} finally {
			setProgress(null);
		}
	}

	if (value) {
		return (
			<div className={cn("relative inline-block", className)}>
				<img
					src={value}
					alt="Uploaded"
					className="h-24 w-24 rounded-md border object-cover"
				/>
				<Button
					type="button"
					variant="secondary"
					size="icon"
					className="-right-2 -top-2 absolute size-6 rounded-full shadow"
					onClick={() => onChange(null)}
					aria-label="Remove photo"
				>
					<XIcon className="size-3.5" />
				</Button>
			</div>
		);
	}

	return (
		<div className={className}>
			<input
				ref={inputRef}
				id={inputId}
				type="file"
				accept="image/*"
				capture="environment"
				className="sr-only"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) {
						handleFile(file);
					}
					e.target.value = "";
				}}
			/>
			<Button
				type="button"
				variant="outline"
				className="h-20 w-full border-dashed"
				disabled={progress !== null}
				onClick={() => inputRef.current?.click()}
			>
				{progress !== null ? (
					<span className="flex items-center gap-2 text-sm">
						<Loader2Icon className="size-4 animate-spin" />
						Uploading… {progress}%
					</span>
				) : (
					<span className="flex items-center gap-2 text-sm text-muted-foreground">
						<CameraIcon className="size-5" />
						{label}
					</span>
				)}
			</Button>
		</div>
	);
}
