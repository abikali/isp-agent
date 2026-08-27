"use client";

/** Animated typing dots displayed while bot is composing. */
export function TypingBubble() {
	return (
		<div className="flex justify-end">
			<div className="relative max-w-[85%] sm:max-w-[75%]">
				<div className="absolute -right-1.5 top-0 size-3 overflow-hidden">
					<div className="absolute left-0 top-0 size-3 origin-top-left -rotate-45 bg-primary/10" />
				</div>
				<div className="flex items-center gap-1 rounded-lg rounded-tr-none bg-primary/10 px-4 py-3">
					{/* react-doctor-disable-next-line react-doctor/no-inline-bounce-easing -- bouncing dots are the established typing-indicator idiom; the bounce is the intended affordance */}
					<span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
					{/* react-doctor-disable-next-line react-doctor/no-inline-bounce-easing -- bouncing dots are the established typing-indicator idiom; the bounce is the intended affordance */}
					<span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
					{/* react-doctor-disable-next-line react-doctor/no-inline-bounce-easing -- bouncing dots are the established typing-indicator idiom; the bounce is the intended affordance */}
					<span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
				</div>
			</div>
		</div>
	);
}
