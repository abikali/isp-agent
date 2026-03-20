"use client";

import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	ChevronDownIcon,
	CopyIcon,
	PencilIcon,
	ReplyIcon,
	TrashIcon,
} from "lucide-react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageContextMenuProps {
	role: string;
	content: string;
	isDeleted: boolean;
	onReply: () => void;
	onReact: (emoji: string) => void;
	onEdit?: (() => void) | undefined;
	onDelete?: (() => void) | undefined;
}

export function MessageContextMenu({
	role,
	content,
	isDeleted,
	onReply,
	onReact,
	onEdit,
	onDelete,
}: MessageContextMenuProps) {
	if (isDeleted) {
		return null;
	}

	const isAdmin = role === "admin";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
				>
					<ChevronDownIcon className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto">
				{/* Inline emoji reactions */}
				<div className="flex gap-0.5 px-1 py-1">
					{QUICK_REACTIONS.map((emoji) => (
						<button
							key={emoji}
							type="button"
							onClick={() => onReact(emoji)}
							className="rounded-md px-1.5 py-1 text-base transition-colors hover:bg-accent"
						>
							{emoji}
						</button>
					))}
				</div>

				<DropdownMenuSeparator />

				<DropdownMenuItem onClick={onReply}>
					<ReplyIcon className="mr-2 size-4" />
					Reply
				</DropdownMenuItem>

				<DropdownMenuItem
					onClick={() => navigator.clipboard.writeText(content)}
				>
					<CopyIcon className="mr-2 size-4" />
					Copy
				</DropdownMenuItem>

				{isAdmin && onEdit && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onEdit}>
							<PencilIcon className="mr-2 size-4" />
							Edit
						</DropdownMenuItem>
					</>
				)}

				{isAdmin && onDelete && (
					<DropdownMenuItem
						onClick={onDelete}
						className="text-destructive"
					>
						<TrashIcon className="mr-2 size-4" />
						Delete
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
