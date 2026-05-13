"use client";

import { useChat } from "@ai-sdk/react";
import { CustomerCombobox } from "@shared/components/CustomerCombobox";
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { cn } from "@ui/lib";
import {
	DefaultChatTransport,
	getToolName,
	isToolUIPart,
	type UIMessage,
} from "ai";
import {
	ArrowUpIcon,
	BotIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	LoaderIcon,
	RotateCcwIcon,
	UserIcon,
	WrenchIcon,
} from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ChatMarkdown } from "./ChatMarkdown";

interface AgentDebugChatProps {
	agentId: string;
}

interface ImpersonatedCustomer {
	id: string | null;
	name: string;
	phone: string;
}

const EMPTY_IMPERSONATION: ImpersonatedCustomer = {
	id: null,
	name: "",
	phone: "",
};

function ToolCallIndicator({
	name,
	isComplete,
}: {
	name: string;
	isComplete: boolean;
}) {
	return (
		<div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
			<WrenchIcon className="size-3" />
			<span>{isComplete ? `Used ${name}` : `Running ${name}...`}</span>
			{!isComplete && <LoaderIcon className="size-3 animate-spin" />}
		</div>
	);
}

function CollapsibleJson({
	label,
	content,
}: {
	label: string;
	content: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	return (
		<div className="min-w-0 w-full overflow-hidden rounded-lg border bg-muted/30 text-xs">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-1 px-2.5 py-1.5 text-muted-foreground hover:text-foreground"
			>
				{isOpen ? (
					<ChevronDownIcon className="size-3" />
				) : (
					<ChevronRightIcon className="size-3" />
				)}
				<span>{label}</span>
			</button>
			{isOpen && (
				<pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all border-t px-2.5 py-2 font-mono text-[11px] leading-relaxed">
					{content}
				</pre>
			)}
		</div>
	);
}

function TypingDots() {
	return (
		<div className="flex items-center gap-1 py-0.5">
			<span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:0ms]" />
			<span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:150ms]" />
			<span className="size-1.5 animate-bounce rounded-full bg-current opacity-60 [animation-delay:300ms]" />
		</div>
	);
}

export function AgentDebugChat({ agentId }: AgentDebugChatProps) {
	const [impersonation, setImpersonation] =
		useState<ImpersonatedCustomer>(EMPTY_IMPERSONATION);
	// Bumped when "Reset chat" is clicked to remount the chat and clear messages.
	const [chatKey, setChatKey] = useState(0);

	function handlePickCustomer(
		picked: {
			id: string;
			name: string;
			username: string | null;
			mobile?: string | null;
		} | null,
	) {
		if (!picked) {
			setImpersonation(EMPTY_IMPERSONATION);
			return;
		}
		setImpersonation({
			id: picked.id,
			name: picked.name,
			phone: picked.mobile ?? "",
		});
	}

	function handleReset() {
		setChatKey((k) => k + 1);
	}

	return (
		<div className="space-y-4">
			<Card>
				<CardContent className="space-y-4 pt-6">
					<div>
						<h3 className="text-sm font-semibold">
							Impersonate WhatsApp customer
						</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							The agent runs as if it received this message on
							WhatsApp — the phone is treated as the verified
							sender, exactly like the real WhatsApp webhook. Pick
							a customer to auto-fill, or enter a phone manually
							to test edge cases like unknown contacts.
						</p>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-1.5 sm:col-span-2">
							<Label className="text-xs">Customer</Label>
							<CustomerCombobox
								value={
									impersonation.id
										? {
												id: impersonation.id,
												name: impersonation.name,
												username: null,
											}
										: null
								}
								onChange={handlePickCustomer}
								placeholder="Search a customer to impersonate…"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="debug-phone" className="text-xs">
								Verified phone
							</Label>
							<Input
								id="debug-phone"
								value={impersonation.phone}
								onChange={(e) =>
									setImpersonation((s) => ({
										...s,
										phone: e.target.value,
									}))
								}
								placeholder="9613035468"
								className="h-9"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="debug-name" className="text-xs">
								Contact name
							</Label>
							<Input
								id="debug-name"
								value={impersonation.name}
								onChange={(e) =>
									setImpersonation((s) => ({
										...s,
										name: e.target.value,
									}))
								}
								placeholder="Optional display name"
								className="h-9"
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="overflow-hidden">
				<div className="flex items-center justify-between border-b px-4 py-2.5">
					<div className="flex items-center gap-2">
						<BotIcon className="size-4 text-muted-foreground" />
						<span className="text-sm font-medium">
							Mock WhatsApp conversation
						</span>
						<span className="text-[11px] text-muted-foreground">
							(ephemeral — not saved)
						</span>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={handleReset}
						className="h-7 gap-1.5 text-xs"
					>
						<RotateCcwIcon className="size-3" />
						Reset chat
					</Button>
				</div>

				<DebugChatInner
					key={chatKey}
					agentId={agentId}
					contactPhone={impersonation.phone.trim() || undefined}
					contactName={impersonation.name.trim() || undefined}
				/>
			</Card>
		</div>
	);
}

function DebugChatInner({
	agentId,
	contactPhone,
	contactName,
}: {
	agentId: string;
	contactPhone: string | undefined;
	contactName: string | undefined;
}) {
	const [inputValue, setInputValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	// Recreate the transport when impersonation changes so the new phone/name
	// is sent on the next message.
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/ai-agents/debug/stream",
				body: {
					agentId,
					...(contactPhone ? { contactPhone } : {}),
					...(contactName ? { contactName } : {}),
				},
			}),
		[agentId, contactPhone, contactName],
	);

	const { messages, sendMessage, status } = useChat({
		transport,
	});

	const isLoading = status === "streaming" || status === "submitted";

	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		scrollToBottom();
	}, [messages, isLoading]);

	function resizeTextarea() {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
		}
	}

	function handleSend() {
		const text = inputValue.trim();
		if (!text || isLoading) {
			return;
		}
		setInputValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
		sendMessage({ text });
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	return (
		<>
			<div className="max-h-[60dvh] min-h-[280px] overflow-y-auto px-4 py-4">
				{messages.length === 0 ? (
					<div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
						<BotIcon className="mb-2 size-6 opacity-50" />
						<p>Send a message as if you were on WhatsApp.</p>
						{contactPhone ? (
							<p className="mt-1 text-[11px]">
								Verified phone:{" "}
								<span className="font-mono">
									{contactPhone}
								</span>
							</p>
						) : (
							<p className="mt-1 text-[11px]">
								No verified phone set — tools will rely on what
								you type.
							</p>
						)}
					</div>
				) : (
					<div className="space-y-4">
						{messages.map((msg) => (
							<DebugMessage key={msg.id} message={msg} />
						))}
						{isLoading &&
							(messages.length === 0 ||
								messages[messages.length - 1]?.role ===
									"user") && (
								<div className="flex gap-2.5">
									<Avatar className="mt-0.5 size-7 shrink-0 rounded-full">
										<AvatarFallback className="rounded-full bg-muted">
											<BotIcon className="size-3.5" />
										</AvatarFallback>
									</Avatar>
									<div className="rounded-2xl rounded-bl-lg bg-muted px-4 py-3 text-muted-foreground">
										<TypingDots />
									</div>
								</div>
							)}
					</div>
				)}
				<div ref={bottomRef} className="h-1" />
			</div>

			<div className="border-t bg-background/95 px-3 py-3">
				<div className="flex items-end gap-2">
					<textarea
						ref={textareaRef}
						value={inputValue}
						onChange={(e) => {
							setInputValue(e.target.value);
							resizeTextarea();
						}}
						onKeyDown={handleKeyDown}
						placeholder="Type the WhatsApp message…"
						disabled={isLoading}
						rows={1}
						className={cn(
							"flex-1 resize-none rounded-2xl border border-input bg-muted/40 px-4 py-2.5 text-sm leading-relaxed",
							"placeholder:text-muted-foreground/50",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"max-h-40 min-h-[42px]",
						)}
					/>
					<Button
						type="button"
						onClick={handleSend}
						disabled={!inputValue.trim() || isLoading}
						size="icon"
						className="size-[42px] shrink-0 rounded-full"
					>
						<ArrowUpIcon className="size-4" />
						<span className="sr-only">Send</span>
					</Button>
				</div>
			</div>
		</>
	);
}

function DebugMessage({ message }: { message: UIMessage }) {
	const isUser = message.role === "user";
	return (
		<div
			className={cn(
				"flex gap-2.5",
				isUser ? "flex-row-reverse" : "flex-row",
			)}
		>
			<Avatar className="mt-0.5 size-7 shrink-0 rounded-full">
				<AvatarFallback
					className={cn(
						"rounded-full",
						isUser ? "bg-primary/10" : "bg-muted",
					)}
				>
					{isUser ? (
						<UserIcon className="size-3.5" />
					) : (
						<BotIcon className="size-3.5" />
					)}
				</AvatarFallback>
			</Avatar>
			<div
				className={cn(
					"flex max-w-[85%] flex-col gap-1.5 sm:max-w-[75%]",
					isUser ? "items-end" : "items-start",
				)}
			>
				{message.parts.map((part, pi) => {
					if (part.type === "text") {
						if (!part.text) {
							return null;
						}
						return (
							<div
								key={`${message.id}-${pi}`}
								className={cn(
									"rounded-2xl px-3.5 py-2.5",
									isUser
										? "rounded-br-lg bg-primary text-primary-foreground"
										: "rounded-bl-lg bg-muted text-foreground",
								)}
							>
								{isUser ? (
									<p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
										{part.text}
									</p>
								) : (
									<ChatMarkdown content={part.text} />
								)}
							</div>
						);
					}
					if (isToolUIPart(part)) {
						const toolName = getToolName(part);
						const isResult =
							"output" in part && part.output !== undefined;
						const inputJson =
							"input" in part && part.input !== undefined
								? JSON.stringify(part.input, null, 2)
								: null;
						const outputJson = isResult
							? typeof part.output === "string"
								? part.output
								: JSON.stringify(part.output, null, 2)
							: null;
						return (
							<div
								key={`${message.id}-tc-${pi}`}
								className="flex w-full flex-col gap-1.5"
							>
								<ToolCallIndicator
									name={toolName}
									isComplete={isResult}
								/>
								{inputJson && (
									<CollapsibleJson
										label="Tool input"
										content={inputJson}
									/>
								)}
								{outputJson && (
									<CollapsibleJson
										label="Tool result"
										content={outputJson}
									/>
								)}
							</div>
						);
					}
					if (part.type === "reasoning" && part.text) {
						return (
							<div
								key={`${message.id}-th-${pi}`}
								className="max-w-full rounded-lg bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground"
							>
								{part.text}
							</div>
						);
					}
					return null;
				})}
			</div>
		</div>
	);
}
