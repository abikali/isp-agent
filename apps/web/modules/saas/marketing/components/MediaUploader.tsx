"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { uploadWithProgress } from "@shared/lib/upload";
import { Alert, AlertDescription } from "@ui/components/alert";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { cn } from "@ui/lib";
import {
	FileTextIcon,
	ImageIcon,
	Loader2Icon,
	UploadCloudIcon,
	VideoIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { useCreateAssetUploadUrl } from "../hooks/use-marketing";
import { isPreviewMediaUrl } from "./media-utils";

type MediaKind = "image" | "video" | "document";

interface MediaUploaderProps {
	kind: MediaKind;
	value: string;
	onChange: (url: string) => void;
}

const ACCEPT_BY_KIND: Record<MediaKind, Record<string, string[]>> = {
	image: {
		"image/jpeg": [".jpg", ".jpeg"],
		"image/png": [".png"],
		"image/webp": [".webp"],
	},
	video: {
		"video/mp4": [".mp4"],
		"video/3gpp": [".3gp"],
	},
	document: {
		"application/pdf": [".pdf"],
	},
};

const KIND_ICON: Record<MediaKind, typeof ImageIcon> = {
	image: ImageIcon,
	video: VideoIcon,
	document: FileTextIcon,
};

const KIND_HINT: Record<MediaKind, string> = {
	image: "JPG, PNG, or WEBP — max 5 MB",
	video: "MP4 or 3GPP — max 16 MB",
	document: "PDF — max 100 MB",
};

const MAX_SIZE_MB: Record<MediaKind, number> = {
	image: 5,
	video: 16,
	document: 100,
};

/**
 * Upload + URL input for WhatsApp template header media. Uploaded files
 * land in R2 and we hand the broadcast a `/image-proxy/...` URL that
 * WhatsApp resolves at send-time.
 */
export function MediaUploader({ kind, value, onChange }: MediaUploaderProps) {
	const organizationId = useOrganizationId();
	const uploadUrl = useCreateAssetUploadUrl();
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState(0);
	const [tab, setTab] = useState<"upload" | "url">(
		isPreviewMediaUrl(value) || value.length === 0 ? "upload" : "url",
	);
	const Icon = KIND_ICON[kind];

	const handleFile = async (file: File) => {
		if (!organizationId) {
			return;
		}
		const maxBytes = MAX_SIZE_MB[kind] * 1024 * 1024;
		if (file.size > maxBytes) {
			toast.error(`File too large (max ${MAX_SIZE_MB[kind]} MB)`);
			return;
		}
		setUploading(true);
		setProgress(0);
		try {
			const { uploadUrl: signedUrl, publicUrl } =
				await uploadUrl.mutateAsync({
					organizationId,
					filename: file.name,
					contentType: file.type,
				});

			await uploadWithProgress(signedUrl, file, setProgress);

			onChange(publicUrl);
			toast.success("Uploaded");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Upload failed";
			toast.error(message);
		} finally {
			setUploading(false);
			setProgress(0);
		}
	};

	const { getRootProps, getInputProps, isDragActive } = useDropzone({
		onDrop: (files) => {
			const file = files[0];
			if (file) {
				handleFile(file);
			}
		},
		accept: ACCEPT_BY_KIND[kind],
		multiple: false,
		disabled: uploading,
	});

	const hasValue = value.trim().length > 0;
	const previewMediaUrl = isPreviewMediaUrl(value);

	return (
		<div className="space-y-3">
			<Tabs
				value={tab}
				onValueChange={(v) => setTab(v as "upload" | "url")}
			>
				<TabsList className="grid w-full max-w-xs grid-cols-2">
					<TabsTrigger value="upload" disabled={uploading}>
						Upload
					</TabsTrigger>
					<TabsTrigger value="url" disabled={uploading}>
						Public URL
					</TabsTrigger>
				</TabsList>

				<TabsContent value="upload" className="mt-3 space-y-2">
					<div
						{...getRootProps()}
						className={cn(
							"flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-6 text-center transition",
							isDragActive
								? "border-primary bg-primary/5"
								: "border-border hover:border-primary/40",
							uploading && "pointer-events-none opacity-60",
						)}
					>
						<input {...getInputProps()} />
						{uploading ? (
							<>
								<Loader2Icon className="size-6 animate-spin text-muted-foreground" />
								<div className="w-full max-w-xs">
									<div className="h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="h-full bg-primary transition-[width]"
											style={{ width: `${progress}%` }}
										/>
									</div>
									<div className="mt-1 text-xs text-muted-foreground">
										Uploading… {progress}%
									</div>
								</div>
							</>
						) : (
							<>
								<UploadCloudIcon className="size-6 text-muted-foreground" />
								<div>
									<div className="text-sm font-medium">
										Click to upload or drop a {kind} here
									</div>
									<div className="text-xs text-muted-foreground">
										{KIND_HINT[kind]}
									</div>
								</div>
							</>
						)}
					</div>
				</TabsContent>

				<TabsContent value="url" className="mt-3 space-y-2">
					<Input
						type="url"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						placeholder={`https://example.com/your-${kind}.${kindExt(
							kind,
						)}`}
						aria-invalid={previewMediaUrl || undefined}
					/>
					<p className="text-xs text-muted-foreground">
						Paste a public HTTPS URL. The asset must remain
						available — WhatsApp re-downloads it for every
						recipient.
					</p>
				</TabsContent>
			</Tabs>

			{hasValue && (
				<div className="flex items-start gap-3 rounded-lg border bg-card p-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
						<Icon className="size-5 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex items-center gap-2">
							<Badge variant="outline" className="uppercase">
								{kind}
							</Badge>
							<span className="text-xs text-muted-foreground">
								Header media
							</span>
						</div>
						{kind === "image" && !previewMediaUrl ? (
							<img
								src={value}
								alt="Header preview"
								className="mt-1 max-h-40 rounded border object-contain"
								onError={(e) => {
									(
										e.target as HTMLImageElement
									).style.display = "none";
								}}
							/>
						) : null}
						<a
							href={value}
							target="_blank"
							rel="noreferrer"
							className="block truncate text-xs text-muted-foreground hover:underline"
						>
							{value}
						</a>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={() => onChange("")}
						disabled={uploading}
						aria-label="Remove media"
					>
						<XIcon className="size-4" />
					</Button>
				</div>
			)}

			{previewMediaUrl && (
				<Alert variant="error">
					<AlertDescription>
						<code>scontent.whatsapp.net</code> URLs are Meta preview
						handles — they're accepted but won't deliver. Replace
						with your own asset.
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

function kindExt(kind: MediaKind): string {
	if (kind === "image") {
		return "jpg";
	}
	if (kind === "video") {
		return "mp4";
	}
	return "pdf";
}
