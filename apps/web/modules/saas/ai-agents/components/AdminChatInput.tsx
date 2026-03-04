"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import {
	CheckIcon,
	LoaderIcon,
	MicIcon,
	PaperclipIcon,
	SendIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSendAdminMessage } from "../hooks/use-all-conversations";
import { EmojiPicker } from "./EmojiPicker";
import { VoiceRecorder } from "./VoiceRecorder";

interface ReplyTarget {
	id: string;
	role: string;
	content: string;
}

interface EditingMessage {
	id: string;
	content: string;
}

export function AdminChatInput({
	conversationId,
	organizationId,
	replyTo,
	onCancelReply,
	editingMessage,
	onCancelEdit,
	onSaveEdit,
}: {
	conversationId: string;
	organizationId: string;
	replyTo?: ReplyTarget | null | undefined;
	onCancelReply?: (() => void) | undefined;
	editingMessage?: EditingMessage | null | undefined;
	onCancelEdit?: (() => void) | undefined;
	onSaveEdit?: ((messageId: string, content: string) => void) | undefined;
}) {
	const [value, setValue] = useState("");
	const [isRecording, setIsRecording] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const mutation = useSendAdminMessage();

	// Pre-populate when entering edit mode
	useEffect(() => {
		if (editingMessage) {
			setValue(editingMessage.content);
			textareaRef.current?.focus();
		}
	}, [editingMessage]);

	const resizeTextarea = useCallback(() => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
		}
	}, []);

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed) {
			return;
		}

		// Edit mode
		if (editingMessage && onSaveEdit) {
			onSaveEdit(editingMessage.id, trimmed);
			setValue("");
			if (textareaRef.current) {
				textareaRef.current.style.height = "auto";
			}
			return;
		}

		// Normal send
		if (mutation.isPending) {
			return;
		}
		mutation.mutate(
			{
				conversationId,
				organizationId,
				message: trimmed,
				replyToId: replyTo?.id,
			},
			{
				onSuccess: () => {
					setValue("");
					if (textareaRef.current) {
						textareaRef.current.style.height = "auto";
					}
					onCancelReply?.();
				},
			},
		);
	}

	function handleCancel() {
		if (editingMessage) {
			onCancelEdit?.();
			setValue("");
		} else if (replyTo) {
			onCancelReply?.();
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
		if (e.key === "Escape") {
			handleCancel();
		}
	}

	const hasText = value.trim().length > 0;
	const isEditing = !!editingMessage;

	return (
		<div className="border-t bg-background">
			{/* Reply preview bar */}
			{replyTo && !isEditing && (
				<div className="flex items-center gap-2 border-b px-3 py-1.5">
					<div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
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
					<Button
						variant="ghost"
						size="icon"
						className="size-6 shrink-0"
						onClick={onCancelReply}
					>
						<XIcon className="size-3.5" />
					</Button>
				</div>
			)}

			{/* Edit mode label */}
			{isEditing && (
				<div className="flex items-center gap-2 border-b px-3 py-1.5">
					<span className="text-xs font-medium text-primary">
						Editing message
					</span>
					<div className="flex-1" />
					<Button
						variant="ghost"
						size="icon"
						className="size-6 shrink-0"
						onClick={onCancelEdit}
					>
						<XIcon className="size-3.5" />
					</Button>
				</div>
			)}

			<div className="flex items-end gap-1.5 px-3 py-2">
				{/* Voice recorder overlay */}
				{isRecording ? (
					<div className="flex-1">
						<VoiceRecorder
							onRecordingComplete={() => {
								// TODO: upload audio blob and send as attachment
								setIsRecording(false);
							}}
							onCancel={() => setIsRecording(false)}
						/>
					</div>
				) : (
					<>
						{/* Emoji picker */}
						{!isEditing && (
							<EmojiPicker
								onEmojiSelect={(emoji) => {
									setValue((prev) => prev + emoji);
									textareaRef.current?.focus();
								}}
							/>
						)}

						{/* Attachment placeholder */}
						{!isEditing && (
							<Button
								variant="ghost"
								size="icon"
								className="size-9 shrink-0 text-muted-foreground"
								disabled
								title="Attach file (coming soon)"
							>
								<PaperclipIcon className="size-5" />
							</Button>
						)}

						{/* Text input */}
						<div className="relative flex-1">
							<textarea
								ref={textareaRef}
								value={value}
								onChange={(e) => {
									setValue(e.target.value);
									resizeTextarea();
								}}
								onKeyDown={handleKeyDown}
								placeholder={
									isEditing
										? "Edit message..."
										: "Type a message"
								}
								disabled={mutation.isPending}
								rows={1}
								className={cn(
									"flex w-full resize-none rounded-2xl border border-input bg-muted/40 px-4 py-2 text-sm leading-relaxed",
									"placeholder:text-muted-foreground/50",
									"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring",
									"disabled:cursor-not-allowed disabled:opacity-50",
									"max-h-40 min-h-[38px]",
								)}
							/>
						</div>

						{/* Action button */}
						{isEditing ? (
							<Button
								onClick={handleSend}
								disabled={!hasText}
								size="icon"
								className="size-9 shrink-0 rounded-full"
							>
								<CheckIcon className="size-4" />
								<span className="sr-only">Save edit</span>
							</Button>
						) : hasText || mutation.isPending ? (
							<Button
								onClick={handleSend}
								disabled={!hasText || mutation.isPending}
								size="icon"
								className="size-9 shrink-0 rounded-full"
							>
								{mutation.isPending ? (
									<LoaderIcon className="size-4 animate-spin" />
								) : (
									<SendIcon className="size-4" />
								)}
								<span className="sr-only">
									Send admin message
								</span>
							</Button>
						) : (
							<Button
								variant="ghost"
								size="icon"
								className="size-9 shrink-0 text-muted-foreground"
								onClick={() => setIsRecording(true)}
								title="Record voice note"
							>
								<MicIcon className="size-5" />
							</Button>
						)}
					</>
				)}
			</div>
		</div>
	);
}
