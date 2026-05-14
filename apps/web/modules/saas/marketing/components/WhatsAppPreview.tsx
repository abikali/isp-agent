"use client";

import type { SaltiTemplate } from "@repo/integrations";
import { cn } from "@ui/lib";
import {
	CheckCheckIcon,
	FileTextIcon,
	ImageIcon,
	VideoIcon,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";
import {
	headerFormatToMediaKind,
	renderPlaceholderPreview,
} from "../lib/template-placeholders";

interface WhatsAppPreviewProps {
	template: SaltiTemplate | undefined;
	headerValues?: string[];
	bodyValues?: string[];
	headerMediaUrl?: string;
	className?: string;
}

/**
 * WhatsApp-style chat bubble preview for a template. Renders header
 * (text or media), body with `{{N}}` placeholders substituted, footer and
 * buttons. Best-effort substitution — we accept that the actual delivered
 * text will swap in per-recipient variables.
 */
export function WhatsAppPreview({
	template,
	headerValues = [],
	bodyValues = [],
	headerMediaUrl,
	className,
}: WhatsAppPreviewProps) {
	const sections = useMemo(() => {
		if (!template) {
			return null;
		}
		let headerText: string | null = null;
		let bodyText: string | null = null;
		let footerText: string | null = null;
		let headerFormat: string | null = null;
		const buttons: Array<{ text: string; url?: string }> = [];
		for (const c of template.components ?? []) {
			const type = String(c.type ?? "").toUpperCase();
			if (type === "HEADER") {
				headerFormat = (c.format ?? "TEXT").toUpperCase();
				if (c.format === "TEXT" || !c.format) {
					headerText = renderPlaceholderPreview(c.text, headerValues);
				}
			} else if (type === "BODY") {
				bodyText = renderPlaceholderPreview(c.text, bodyValues);
			} else if (type === "FOOTER") {
				footerText = c.text ?? null;
			} else if (type === "BUTTONS" && c.buttons) {
				for (const b of c.buttons) {
					buttons.push({ text: b.text, url: b.url });
				}
			}
		}
		return {
			headerText,
			bodyText,
			footerText,
			buttons,
			headerFormat,
		};
	}, [template, headerValues, bodyValues]);

	if (!template) {
		return (
			<div
				className={cn(
					"flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground",
					className,
				)}
			>
				Select a template to preview
			</div>
		);
	}

	const mediaKind = headerFormatToMediaKind(
		(sections?.headerFormat ?? "NONE") as Parameters<
			typeof headerFormatToMediaKind
		>[0],
	);

	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border bg-[#e5ddd5] dark:bg-[#0b141a]",
				className,
			)}
		>
			{/* Chat header */}
			<div className="flex items-center gap-3 border-b bg-[#075e54] px-3 py-2 text-white dark:bg-[#202c33]">
				<div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
					ISP
				</div>
				<div className="min-w-0">
					<div className="truncate text-sm font-medium">
						Your customer
					</div>
					<div className="truncate text-xs text-white/70">
						{template.name} · {template.language}
					</div>
				</div>
			</div>

			{/* Chat body */}
			<div
				className="space-y-2 px-3 py-4"
				style={{
					backgroundImage:
						"radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
					backgroundSize: "16px 16px",
				}}
			>
				<div className="ml-auto max-w-[88%] rounded-lg bg-white p-2 shadow-sm dark:bg-[#005c4b] dark:text-white">
					{/* Header media */}
					{mediaKind ? (
						<MediaThumb
							url={headerMediaUrl ?? ""}
							kind={mediaKind}
						/>
					) : null}
					{sections?.headerText ? (
						<div className="mb-1 font-semibold leading-tight text-foreground dark:text-white">
							{sections.headerText}
						</div>
					) : null}
					{sections?.bodyText ? (
						<div className="whitespace-pre-wrap text-sm leading-snug text-foreground dark:text-white">
							{sections.bodyText}
						</div>
					) : null}
					{sections?.footerText ? (
						<div className="mt-2 text-xs text-muted-foreground dark:text-white/60">
							{sections.footerText}
						</div>
					) : null}
					<div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground dark:text-white/60">
						<span>now</span>
						<CheckCheckIcon className="size-3" />
					</div>
				</div>
				{sections && sections.buttons.length > 0 && (
					<div className="ml-auto flex max-w-[88%] flex-col gap-1">
						{sections.buttons.map((b, i) => (
							<div
								key={`${b.text}-${i}`}
								className="rounded-lg bg-white/95 px-3 py-2 text-center text-sm font-medium text-[#00a884] shadow-sm dark:bg-[#005c4b]/80 dark:text-[#53bdeb]"
							>
								{b.text}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function MediaThumb({
	url,
	kind,
}: {
	url: string;
	kind: "image" | "video" | "document";
}) {
	if (!url) {
		return (
			<EmptyMediaBox kind={kind}>No {kind} attached yet</EmptyMediaBox>
		);
	}
	if (kind === "image") {
		return (
			<img
				src={url}
				alt="header"
				className="mb-2 max-h-48 w-full rounded-md object-cover"
				onError={(e) => {
					(e.target as HTMLImageElement).replaceWith(
						(() => {
							const div = document.createElement("div");
							div.className =
								"mb-2 flex h-32 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground";
							div.textContent = "Image failed to load";
							return div;
						})(),
					);
				}}
			/>
		);
	}
	if (kind === "video") {
		return (
			<div className="mb-2 flex h-32 items-center justify-center rounded-md bg-muted/80">
				<VideoIcon className="size-8 text-muted-foreground" />
			</div>
		);
	}
	return (
		<div className="mb-2 flex items-center gap-2 rounded-md bg-muted/80 p-2">
			<FileTextIcon className="size-5 text-muted-foreground" />
			<span className="truncate text-xs text-muted-foreground">
				PDF document
			</span>
		</div>
	);
}

function EmptyMediaBox({
	kind,
	children,
}: {
	kind: "image" | "video" | "document";
	children: ReactNode;
}) {
	const Icon =
		kind === "image"
			? ImageIcon
			: kind === "video"
				? VideoIcon
				: FileTextIcon;
	return (
		<div className="mb-2 flex h-28 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/60 text-xs text-muted-foreground">
			<Icon className="size-5" />
			{children}
		</div>
	);
}
