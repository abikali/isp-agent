"use client";

import { cn } from "@ui/lib";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { BotIcon } from "lucide-react";
import { formatMessageTime } from "../lib/chat-utils";
import { AttachmentContent } from "./AttachmentContent";
import { DeliveryTicks } from "./DeliveryTicks";
import { MessageContextMenu } from "./MessageContextMenu";
import { type ToolCallData, ToolCallPill } from "./ToolCallPill";

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

function partsToToolCalls(
	parts: UIMessage["parts"] | undefined,
): ToolCallData[] {
	if (!Array.isArray(parts)) {
		return [];
	}
	const out: ToolCallData[] = [];
	for (const part of parts) {
		if (!isToolUIPart(part)) {
			continue;
		}
		if (part.state !== "output-available") {
			continue;
		}
		out.push({
			toolCallId: part.toolCallId,
			toolName: getToolName(part),
			args: part.input,
			result: part.output,
		});
	}
	return out;
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
	parts?: UIMessage["parts"] | null | undefined;
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
	parts,
	onReply,
	onReact,
	onEdit,
	onDelete,
	onReactionClick,
}: MessageBubbleProps) {
	const toolCalls = partsToToolCalls(parts ?? undefined);
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
				<div className="max-w-[85%] rounded-lg bg-muted/50 px-3 py-1.5 sm:max-w-[75%]">
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
			<div className="relative max-w-[85%] sm:max-w-[75%]">
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
							{toolCalls.map((tc) => (
								<ToolCallPill
									key={tc.toolCallId}
									toolCall={tc}
								/>
							))}
						</div>
					)}

					{/* Content */}
					{content &&
						(attachmentType === "voice" ? (
							content !== "[Voice message received]" && (
								<div className="mt-1.5 border-l-2 border-primary/30 pl-2">
									<p className="text-xs italic text-muted-foreground leading-relaxed">
										{content}
									</p>
								</div>
							)
						) : (
							<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
								{content}
							</p>
						))}

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
