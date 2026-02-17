"use client";

import { orpc } from "@shared/lib/orpc";
import {
	fetchServerSentEvents,
	type UIMessage,
	useChat,
} from "@tanstack/ai-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@ui/components/avatar";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	ArrowUpIcon,
	BotIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	EllipsisVerticalIcon,
	LoaderIcon,
	MessageCircleOffIcon,
	PlusIcon,
	Trash2Icon,
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

function getSessionKey(token: string) {
	return `web-chat-session-${token}`;
}

function getOrCreateSessionId(token: string): string {
	const key = getSessionKey(token);
	const existing = sessionStorage.getItem(key);
	if (existing) {
		return existing;
	}
	const id = crypto.randomUUID();
	sessionStorage.setItem(key, id);
	return id;
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

function formatTime(date: Date | undefined) {
	if (!date) {
		return "";
	}
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

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

function ToolResultDisplay({ content }: { content: string }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="rounded-lg border bg-muted/30 text-xs">
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
				<span>Tool result</span>
			</button>
			{isOpen && (
				<pre className="max-h-40 overflow-auto border-t px-2.5 py-2 font-mono text-[11px] leading-relaxed">
					{content}
				</pre>
			)}
		</div>
	);
}

function convertHistoryToUIMessages(
	history: Array<{ role: string; content: string; createdAt: string }>,
): UIMessage[] {
	return history.map((msg, i) => ({
		id: `history-${i}`,
		role: msg.role as "user" | "assistant",
		parts: [{ type: "text" as const, content: msg.content }],
		createdAt: new Date(msg.createdAt),
	}));
}

function WebChatInner({
	token,
	sessionId,
	initialMessages,
	agentName,
	agentInitial,
	greetingMessage,
}: {
	token: string;
	sessionId: string;
	initialMessages: UIMessage[];
	agentName: string;
	agentInitial: string;
	greetingMessage: string | null;
}) {
	const [inputValue, setInputValue] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	const connection = useMemo(
		() =>
			fetchServerSentEvents(
				`/api/ai-agents/web-chat/${token}/stream`,
				() => ({
					body: { sessionId },
				}),
			),
		[token, sessionId],
	);

	const { messages, sendMessage, isLoading } = useChat({
		connection,
		initialMessages,
	});

	// Scroll to bottom
	const scrollToBottom = useCallback(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		scrollToBottom();
	}, [messages, isLoading]);

	// Auto-resize textarea
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

		sendMessage(text);
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}

	const hasMessages = messages.length > 0;
	const showWelcome = greetingMessage && !hasMessages;

	return (
		<>
			{/* Messages */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto overscroll-contain"
			>
				<div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
					{/* Welcome state */}
					{showWelcome && (
						<div className="flex min-h-[50dvh] flex-col items-center justify-center py-8 text-center">
							<div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary shadow-md">
								<BotIcon className="size-8 text-primary-foreground" />
							</div>
							<h2 className="mb-2 text-lg font-semibold tracking-tight">
								{agentName}
							</h2>
							<p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
								{greetingMessage}
							</p>
						</div>
					)}

					{/* Message list */}
					<div className="space-y-4">
						{messages.map((msg) => {
							const isUser = msg.role === "user";
							return (
								<div
									key={msg.id}
									className={cn(
										"flex gap-2.5",
										isUser
											? "flex-row-reverse"
											: "flex-row",
									)}
								>
									{/* Bot avatar */}
									{!isUser && (
										<Avatar className="mt-0.5 size-7 shrink-0 rounded-full">
											<AvatarFallback className="rounded-full bg-muted text-[10px] font-semibold">
												{agentInitial}
											</AvatarFallback>
										</Avatar>
									)}

									<div
										className={cn(
											"flex max-w-[85%] flex-col gap-1.5 sm:max-w-[75%]",
											isUser
												? "items-end"
												: "items-start",
										)}
									>
										{msg.parts.map((part, pi) => {
											if (part.type === "text") {
												if (!part.content) {
													return null;
												}
												return (
													<div
														key={`${msg.id}-${pi}`}
														className={cn(
															"rounded-2xl px-3.5 py-2.5",
															isUser
																? "rounded-br-lg bg-primary text-primary-foreground"
																: "rounded-bl-lg bg-muted text-foreground",
														)}
													>
														{isUser ? (
															<p className="whitespace-pre-wrap text-[14px] leading-relaxed">
																{part.content}
															</p>
														) : (
															<ChatMarkdown
																content={
																	part.content
																}
															/>
														)}
													</div>
												);
											}
											if (part.type === "tool-call") {
												return (
													<ToolCallIndicator
														key={`${msg.id}-tc-${pi}`}
														name={part.name}
														isComplete={
															part.state ===
															"input-complete"
														}
													/>
												);
											}
											if (part.type === "tool-result") {
												return (
													<ToolResultDisplay
														key={`${msg.id}-tr-${pi}`}
														content={part.content}
													/>
												);
											}
											if (part.type === "thinking") {
												if (!part.content) {
													return null;
												}
												return (
													<div
														key={`${msg.id}-th-${pi}`}
														className="max-w-full rounded-lg bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground"
													>
														{part.content}
													</div>
												);
											}
											return null;
										})}
										<span
											className={cn(
												"mt-0.5 px-1 text-[10px] text-muted-foreground/50",
												isUser
													? "text-right"
													: "text-left",
											)}
										>
											{formatTime(msg.createdAt)}
										</span>
									</div>
								</div>
							);
						})}

						{/* Typing indicator — only show when loading and no content yet */}
						{isLoading &&
							(messages.length === 0 ||
								messages[messages.length - 1]?.role ===
									"user") && (
								<div className="flex gap-2.5">
									<Avatar className="mt-0.5 size-7 shrink-0 rounded-full">
										<AvatarFallback className="rounded-full bg-muted text-[10px] font-semibold">
											{agentInitial}
										</AvatarFallback>
									</Avatar>
									<div className="rounded-2xl rounded-bl-lg bg-muted px-4 py-3 text-muted-foreground">
										<TypingDots />
									</div>
								</div>
							)}
					</div>

					{/* Scroll anchor */}
					<div ref={bottomRef} className="h-1" />
				</div>
			</div>

			{/* Input area */}
			<div className="border-t bg-background/95 px-3 py-3 backdrop-blur-md sm:px-4 supports-[backdrop-filter]:bg-background/80">
				<div className="mx-auto flex max-w-2xl items-end gap-2">
					<div className="relative flex-1">
						<textarea
							ref={textareaRef}
							value={inputValue}
							onChange={(e) => {
								setInputValue(e.target.value);
								resizeTextarea();
							}}
							onKeyDown={handleKeyDown}
							placeholder="Message..."
							disabled={isLoading}
							rows={1}
							className={cn(
								"flex w-full resize-none rounded-2xl border border-input bg-muted/40 px-4 py-2.5 text-sm leading-relaxed",
								"placeholder:text-muted-foreground/50",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring",
								"disabled:cursor-not-allowed disabled:opacity-50",
								"max-h-40 min-h-[42px]",
							)}
							// biome-ignore lint/a11y/noAutofocus: chat input should auto-focus
							autoFocus
						/>
					</div>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								onClick={handleSend}
								disabled={!inputValue.trim() || isLoading}
								size="icon"
								className="size-[42px] shrink-0 rounded-full transition-transform active:scale-95"
							>
								<ArrowUpIcon className="size-4" />
								<span className="sr-only">Send message</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">Send message</TooltipContent>
					</Tooltip>
				</div>
				<p className="mx-auto mt-1.5 max-w-2xl text-center text-[10px] text-muted-foreground/40">
					Press Enter to send, Shift+Enter for new line
				</p>
			</div>
		</>
	);
}

export function WebChatInterface({ token }: { token: string }) {
	const queryClient = useQueryClient();
	const [sessionId, setSessionId] = useState(() =>
		getOrCreateSessionId(token),
	);
	// Key used to remount WebChatInner to reset useChat state
	const [chatKey, setChatKey] = useState(0);

	const agentInfo = useQuery(
		orpc.aiAgents.webChatInfo.queryOptions({
			input: { token },
		}),
	);

	const history = useQuery(
		orpc.aiAgents.getWebChatHistory.queryOptions({
			input: { token, sessionId },
		}),
	);

	const initialMessages = useMemo(() => {
		if (history.data?.messages && history.data.messages.length > 0) {
			return convertHistoryToUIMessages(history.data.messages);
		}
		return [];
	}, [history.data]);

	function handleNewConversation() {
		const newId = crypto.randomUUID();
		sessionStorage.setItem(getSessionKey(token), newId);
		setSessionId(newId);
		setChatKey((k) => k + 1);
		queryClient.removeQueries({
			queryKey: orpc.aiAgents.getWebChatHistory.key(),
		});
	}

	const agentName = agentInfo.data?.name ?? "Assistant";
	const agentInitial = agentName.charAt(0).toUpperCase();

	// Error state
	if (agentInfo.isError) {
		return (
			<div className="flex h-dvh items-center justify-center bg-background px-6">
				<div className="text-center space-y-4">
					<div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
						<MessageCircleOffIcon className="size-7 text-muted-foreground" />
					</div>
					<div className="space-y-2">
						<h1 className="text-xl font-semibold tracking-tight">
							Chat not available
						</h1>
						<p className="mx-auto max-w-xs text-sm text-muted-foreground">
							This chat link is no longer active or the agent has
							been disabled.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Loading state
	if (agentInfo.isLoading || history.isLoading) {
		return (
			<div className="flex h-dvh items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-3">
					<div className="flex size-12 items-center justify-center rounded-2xl bg-primary">
						<BotIcon className="size-6 text-primary-foreground" />
					</div>
					<LoaderIcon className="size-5 animate-spin text-muted-foreground" />
				</div>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="flex h-dvh flex-col bg-background">
				{/* Header */}
				<header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
					<div className="flex items-center gap-3 min-w-0">
						<Avatar className="size-9 shrink-0 rounded-full">
							<AvatarFallback className="rounded-full bg-primary text-primary-foreground text-xs font-semibold">
								{agentInitial}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<h1 className="truncate text-sm font-semibold leading-tight">
								{agentName}
							</h1>
							<p className="text-[11px] text-muted-foreground">
								<span className="flex items-center gap-1">
									<span className="inline-block size-1.5 rounded-full bg-emerald-500" />
									Online
								</span>
							</p>
						</div>
					</div>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-9 shrink-0"
							>
								<EllipsisVerticalIcon className="size-4" />
								<span className="sr-only">Chat options</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							<DropdownMenuItem onClick={handleNewConversation}>
								<PlusIcon className="mr-2 size-4" />
								New conversation
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => setChatKey((k) => k + 1)}
								className="text-destructive focus:text-destructive"
							>
								<Trash2Icon className="mr-2 size-4" />
								Clear chat
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>

				<WebChatInner
					key={`${sessionId}-${chatKey}`}
					token={token}
					sessionId={sessionId}
					initialMessages={initialMessages}
					agentName={agentName}
					agentInitial={agentInitial}
					greetingMessage={agentInfo.data?.greetingMessage ?? null}
				/>
			</div>
		</TooltipProvider>
	);
}
