"use client";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@ui/components/popover";
import { SmileIcon } from "lucide-react";
import { useState } from "react";

const EMOJI_CATEGORIES = [
	{
		name: "Smileys",
		emojis: [
			"😀",
			"😃",
			"😄",
			"😁",
			"😆",
			"😅",
			"🤣",
			"😂",
			"🙂",
			"😊",
			"😇",
			"🥰",
			"😍",
			"😘",
			"😗",
			"😙",
			"🥲",
			"😋",
			"😛",
			"😜",
			"🤪",
			"😝",
			"🤑",
			"🤗",
			"🤭",
			"🫢",
			"🤫",
			"🤔",
			"🫡",
			"🤐",
			"🤨",
			"😐",
			"😑",
			"😶",
			"🫥",
			"😏",
			"😒",
			"🙄",
			"😬",
			"😮‍💨",
			"🤥",
		],
	},
	{
		name: "Gestures",
		emojis: [
			"👋",
			"🤚",
			"🖐️",
			"✋",
			"🖖",
			"🫱",
			"🫲",
			"👌",
			"🤌",
			"🤏",
			"✌️",
			"🤞",
			"🫰",
			"🤟",
			"🤘",
			"🤙",
			"👈",
			"👉",
			"👆",
			"👇",
			"☝️",
			"👍",
			"👎",
			"✊",
			"👊",
			"🤛",
			"🤜",
			"👏",
			"🙌",
			"🫶",
			"👐",
			"🤲",
			"🤝",
			"🙏",
		],
	},
	{
		name: "Hearts",
		emojis: [
			"❤️",
			"🧡",
			"💛",
			"💚",
			"💙",
			"💜",
			"🖤",
			"🤍",
			"🤎",
			"💔",
			"❤️‍🔥",
			"❤️‍🩹",
			"💕",
			"💞",
			"💓",
			"💗",
			"💖",
			"💘",
			"💝",
			"💟",
		],
	},
	{
		name: "Objects",
		emojis: [
			"🎉",
			"🎊",
			"🎈",
			"🎁",
			"🔥",
			"⭐",
			"🌟",
			"💫",
			"✨",
			"💡",
			"📌",
			"📎",
			"✏️",
			"📝",
			"💬",
			"💭",
			"🗯️",
			"🔔",
			"🎵",
			"🎶",
		],
	},
];

interface EmojiPickerProps {
	onEmojiSelect: (emoji: string) => void;
	disabled?: boolean | undefined;
}

export function EmojiPicker({ onEmojiSelect, disabled }: EmojiPickerProps) {
	const [open, setOpen] = useState(false);
	const [activeCategory, setActiveCategory] = useState(0);

	function handleSelect(emoji: string) {
		onEmojiSelect(emoji);
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={disabled}
					className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
				>
					<SmileIcon className="size-5" />
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="w-72 p-0">
				{/* Category tabs */}
				<div className="flex border-b px-1 py-1">
					{EMOJI_CATEGORIES.map((cat, i) => (
						<button
							key={cat.name}
							type="button"
							onClick={() => setActiveCategory(i)}
							className={`flex-1 rounded px-2 py-1 text-[10px] transition-colors ${
								i === activeCategory
									? "bg-muted font-medium"
									: "text-muted-foreground hover:bg-muted/50"
							}`}
						>
							{cat.name}
						</button>
					))}
				</div>

				{/* Emoji grid */}
				<div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
					{EMOJI_CATEGORIES[activeCategory]?.emojis.map((emoji) => (
						<button
							key={emoji}
							type="button"
							onClick={() => handleSelect(emoji)}
							className="flex size-8 items-center justify-center rounded text-lg hover:bg-muted"
						>
							{emoji}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
