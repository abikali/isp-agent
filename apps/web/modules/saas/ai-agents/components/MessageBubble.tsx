"use client";

import { getStorageImageUrl } from "@shared/lib/image-utils";
import { cn } from "@ui/lib";
import {
	BotIcon,
	CheckCheckIcon,
	CheckIcon,
	ChevronDownIcon,
	WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { formatMessageTime } from "../lib/chat-utils";
import { AudioBubble } from "./AudioBubble";
import { DocumentBubble } from "./DocumentBubble";
import { ImageBubble } from "./ImageBubble";
import { LocationBubble } from "./LocationBubble";
import { MessageContextMenu } from "./MessageContextMenu";

interface ReplyTo {
	id: string;
	role: string;
	content: string;
}

interface Reaction {
	id: string;
	emoji: string;
	userId: string | null;
	contactId: string | null;
}

interface ToolCallData {
	toolName: string;
	args: unknown;
	result: unknown;
}

interface MessageBubbleProps {
	id: string;
	role: string;
	content: string;
	createdAt: Date | string;
	error?: string | null | undefined;
	latencyMs?: number | null | undefined;
	isHighlighted?: boolean | undefined;
	deliveryStatus?: string | null | undefined;
	editedAt?: Date | string | null | undefined;
	deletedAt?: Date | string | null | undefined;
	replyTo?: ReplyTo | null | undefined;
	reactions?: Reaction[] | undefined;
	attachmentType?: string | null | undefined;
	attachmentUrl?: string | null | undefined;
	attachmentFilename?: string | null | undefined;
	attachmentMimeType?: string | null | undefined;
	attachmentSize?: number | null | undefined;
	attachmentMeta?: Record<string, unknown> | null | undefined;
	toolCalls?: ToolCallData[] | null | undefined;
	onReply?: (() => void) | undefined;
	onReact?: ((emoji: string) => void) | undefined;
	onEdit?: (() => void) | undefined;
	onDelete?: (() => void) | undefined;
	onReactionClick?: ((emoji: string) => void) | undefined;
}

export function MessageBubble({
	role,
	content,
	createdAt,
	error,
	latencyMs,
	isHighlighted,
	deliveryStatus,
	editedAt,
	deletedAt,
	replyTo,
	reactions,
	attachmentType,
	attachmentUrl,
	attachmentFilename,
	attachmentMimeType,
	attachmentSize,
	attachmentMeta,
	toolCalls,
	onReply,
	onReact,
	onEdit,
	onDelete,
	onReactionClick,
}: MessageBubbleProps) {
	const isUser = role === "user";
	const isAssistant = role === "assistant";
	const isAdmin = role === "admin";
	const isOutgoing = isAssistant || isAdmin;
	const isDeleted = !!deletedAt;

	// Deleted message: simple italic gray bubble
	if (isDeleted) {
		return (
			<div
				className={cn("flex", isUser ? "justify-start" : "justify-end")}
			>
				<div className="max-w-[75%] rounded-lg bg-muted/50 px-3 py-1.5">
					<p className="text-sm italic text-muted-foreground">
						This message was deleted
					</p>
				</div>
			</div>
		);
	}

	// Group reactions by emoji
	const reactionGroups = new Map<string, number>();
	if (reactions) {
		for (const r of reactions) {
			reactionGroups.set(r.emoji, (reactionGroups.get(r.emoji) ?? 0) + 1);
		}
	}

	return (
		<div
			className={cn(
				"group flex",
				isUser ? "justify-start" : "justify-end",
			)}
		>
			<div className="relative max-w-[75%]">
				{/* Bubble tail */}
				{isUser && (
					<div className="absolute -left-1.5 top-0 size-3 overflow-hidden">
						<div className="absolute right-0 top-0 size-3 origin-top-right rotate-45 bg-muted" />
					</div>
				)}
				{isOutgoing && (
					<div className="absolute -right-1.5 top-0 size-3 overflow-hidden">
						<div
							className={cn(
								"absolute left-0 top-0 size-3 origin-top-left -rotate-45",
								isAdmin ? "bg-amber-500/15" : "bg-primary/10",
							)}
						/>
					</div>
				)}

				{/* Context menu trigger - positioned at top corner */}
				{onReply && onReact && (
					<div
						className={cn(
							"absolute top-1 z-10",
							isUser ? "right-1" : "left-1",
						)}
					>
						<MessageContextMenu
							role={role}
							content={content}
							isDeleted={false}
							onReply={onReply}
							onReact={onReact}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					</div>
				)}

				{/* Bubble body */}
				<div
					className={cn(
						"relative rounded-lg px-3 py-1.5",
						isUser && "rounded-tl-none bg-muted text-foreground",
						isAssistant &&
							"rounded-tr-none bg-primary/10 text-foreground",
						isAdmin &&
							"rounded-tr-none bg-amber-500/15 text-foreground",
						error && "border border-destructive",
						isHighlighted && "ring-2 ring-primary",
					)}
				>
					{/* Role badges */}
					{isAssistant && (
						<div className="mb-0.5 flex items-center gap-1">
							<BotIcon className="size-3 text-primary" />
							<span className="text-[10px] font-semibold text-primary">
								Bot
							</span>
						</div>
					)}
					{isAdmin && (
						<span className="mb-0.5 block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
							Admin
						</span>
					)}

					{/* Reply preview */}
					{replyTo && (
						<div className="mb-1 rounded border-l-2 border-primary bg-background/50 px-2 py-1">
							<span className="text-[10px] font-medium text-primary">
								{replyTo.role === "user"
									? "User"
									: replyTo.role === "admin"
										? "Admin"
										: "Bot"}
							</span>
							<p className="line-clamp-1 text-xs text-muted-foreground">
								{replyTo.content}
							</p>
						</div>
					)}

					{/* Attachment */}
					{attachmentType && attachmentUrl && (
						<AttachmentContent
							type={attachmentType}
							url={attachmentUrl}
							filename={attachmentFilename}
							mimeType={attachmentMimeType}
							size={attachmentSize}
							meta={attachmentMeta}
						/>
					)}

					{/* Tool calls */}
					{toolCalls && toolCalls.length > 0 && (
						<div className="mb-1 space-y-1">
							{toolCalls.map((tc, i) => (
								<ToolCallPill
									key={`${tc.toolName}-${i}`}
									toolCall={tc}
								/>
							))}
						</div>
					)}

					{/* Content */}
					{content && (
						<p className="whitespace-pre-wrap text-sm leading-relaxed">
							{content}
						</p>
					)}

					{/* Timestamp row */}
					<div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-50">
						{latencyMs ? <span>{latencyMs}ms</span> : null}
						{error ? (
							<span className="text-destructive">Error</span>
						) : null}
						{editedAt && <span>edited</span>}
						<span>{formatMessageTime(createdAt)}</span>
						{/* Delivery ticks for outgoing messages */}
						{isOutgoing && (
							<DeliveryTicks status={deliveryStatus} />
						)}
					</div>
				</div>

				{/* Reactions */}
				{reactionGroups.size > 0 && (
					<div className="mt-0.5 flex flex-wrap gap-0.5">
						{Array.from(reactionGroups.entries()).map(
							([emoji, count]) => (
								<button
									key={emoji}
									type="button"
									onClick={() => onReactionClick?.(emoji)}
									className="flex items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm transition-colors hover:bg-muted"
								>
									<span>{emoji}</span>
									{count > 1 && (
										<span className="text-[10px] text-muted-foreground">
											{count}
										</span>
									)}
								</button>
							),
						)}
					</div>
				)}
			</div>
		</div>
	);
}

function AttachmentContent({
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
	if (type === "audio") {
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
			// biome-ignore lint/a11y/useMediaCaption: chat videos don't have caption tracks
			<video
				src={url}
				controls
				className="max-h-64 max-w-full rounded-md"
				preload="metadata"
			/>
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

function DeliveryTicks({ status }: { status: string | null | undefined }) {
	if (!status || status === "sent") {
		return <CheckIcon className="size-3 text-muted-foreground" />;
	}
	if (status === "delivered") {
		return <CheckCheckIcon className="size-3 text-muted-foreground" />;
	}
	if (status === "read") {
		return <CheckCheckIcon className="size-3 text-blue-500" />;
	}
	return null;
}

function formatToolResult(result: unknown): string {
	if (typeof result === "string") {
		return result;
	}
	return JSON.stringify(result, null, 2);
}

/** Collapsible pill showing a tool call with its input and result. */
function ToolCallPill({ toolCall }: { toolCall: ToolCallData }) {
	const [isOpen, setIsOpen] = useState(false);

	const displayName = toolCall.toolName
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	return (
		<div className="rounded-md border bg-background/50 text-xs">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-muted/50"
			>
				<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
				<span className="flex-1 truncate font-medium">
					{displayName}
				</span>
				<ChevronDownIcon
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</button>
			{isOpen && (
				<div className="space-y-1.5 border-t px-2 py-1.5">
					{toolCall.args != null &&
						Object.keys(toolCall.args as object).length > 0 && (
							<div>
								<span className="font-medium text-muted-foreground">
									Input
								</span>
								<pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-[10px]">
									{JSON.stringify(toolCall.args, null, 2)}
								</pre>
							</div>
						)}
					{toolCall.result != null && (
						<div>
							<span className="font-medium text-muted-foreground">
								Result
							</span>
							<pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-[10px]">
								{formatToolResult(toolCall.result)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/** Animated typing dots displayed while bot is composing. */
export function TypingBubble() {
	return (
		<div className="flex justify-end">
			<div className="relative max-w-[75%]">
				<div className="absolute -right-1.5 top-0 size-3 overflow-hidden">
					<div className="absolute left-0 top-0 size-3 origin-top-left -rotate-45 bg-primary/10" />
				</div>
				<div className="flex items-center gap-1 rounded-lg rounded-tr-none bg-primary/10 px-4 py-3">
					<span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
					<span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
					<span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
				</div>
			</div>
		</div>
	);
}

/** Centered date separator pill between message groups. */
export function DateSeparator({ date }: { date: string }) {
	return (
		<div className="flex items-center justify-center py-2">
			<span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
				{date}
			</span>
		</div>
	);
}
