"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { ArrowUpIcon, LoaderIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useSendAdminMessage } from "../hooks/use-all-conversations";

export function AdminChatInput({
	conversationId,
	organizationId,
}: {
	conversationId: string;
	organizationId: string;
}) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const mutation = useSendAdminMessage();

	const resizeTextarea = useCallback(() => {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
		}
	}, []);

	function handleSend() {
		const trimmed = value.trim();
		if (!trimmed || mutation.isPending) {
			return;
		}
		mutation.mutate(
			{
				conversationId,
				organizationId,
				message: trimmed,
			},
			{
				onSuccess: () => {
					setValue("");
					if (textareaRef.current) {
						textareaRef.current.style.height = "auto";
					}
				},
			},
		);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<div className="border-t bg-background p-3">
			<div className="flex items-end gap-2">
				<div className="relative flex-1">
					<textarea
						ref={textareaRef}
						value={value}
						onChange={(e) => {
							setValue(e.target.value);
							resizeTextarea();
						}}
						onKeyDown={handleKeyDown}
						placeholder="Reply as admin..."
						disabled={mutation.isPending}
						rows={1}
						className={cn(
							"flex w-full resize-none rounded-xl border border-input bg-muted/40 px-4 py-2.5 text-sm leading-relaxed",
							"placeholder:text-muted-foreground/50",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"max-h-40 min-h-[42px]",
						)}
					/>
				</div>
				<Button
					onClick={handleSend}
					disabled={!value.trim() || mutation.isPending}
					size="icon"
					className="size-[42px] shrink-0 rounded-full"
				>
					{mutation.isPending ? (
						<LoaderIcon className="size-4 animate-spin" />
					) : (
						<ArrowUpIcon className="size-4" />
					)}
					<span className="sr-only">Send admin message</span>
				</Button>
			</div>
			<p className="mt-1 text-center text-[10px] text-muted-foreground/40">
				Press Enter to send, Shift+Enter for new line
			</p>
		</div>
	);
}
