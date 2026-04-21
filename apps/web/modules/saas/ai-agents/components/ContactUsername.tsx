"use client";

import { cn } from "@ui/lib";
import { UserIcon } from "lucide-react";
import { toast } from "sonner";

/**
 * Copiable username pill surfaced on conversations that are linked to an ISP
 * customer account. Tapping copies the username to the clipboard so operators
 * can paste it into iRadius / billing flows.
 */
export function ContactUsername({
	username,
	className,
}: {
	username: string | null | undefined;
	className?: string;
}) {
	if (!username) {
		return null;
	}
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				e.preventDefault();
				void navigator.clipboard.writeText(username);
				toast.success(`Copied ${username}`);
			}}
			className={cn(
				"inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20",
				className,
			)}
			title="Copy username"
		>
			<UserIcon className="size-3" />
			{username}
		</button>
	);
}
