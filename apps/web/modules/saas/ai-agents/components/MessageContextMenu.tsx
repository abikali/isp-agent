"use client";

import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import {
	ChevronDownIcon,
	CopyIcon,
	PencilIcon,
	ReplyIcon,
	SmileIcon,
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
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem onClick={onReply}>
					<ReplyIcon className="mr-2 size-4" />
					Reply
				</DropdownMenuItem>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<SmileIcon className="mr-2 size-4" />
						React
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<div className="flex gap-1 p-1">
							{QUICK_REACTIONS.map((emoji) => (
								<button
									key={emoji}
									type="button"
									onClick={() => onReact(emoji)}
									className="rounded p-1 text-lg hover:bg-muted"
								>
									{emoji}
								</button>
							))}
						</div>
					</DropdownMenuSubContent>
				</DropdownMenuSub>

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
