"use client";

import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { cn } from "@ui/lib";
import { ExpandIcon } from "lucide-react";
import { useState } from "react";

interface NoteCellProps {
	note: string | null | undefined;
	/** Dialog heading. Defaults to "Note". */
	title?: string;
	/** Muted line under the heading — e.g. the entry date and who recorded it. */
	subtitle?: string;
	className?: string;
}

/**
 * Table cell for free-text notes: truncates to the column width and opens the
 * full text in a dialog on click.
 */
export function NoteCell({
	note,
	title = "Note",
	subtitle,
	className,
}: NoteCellProps) {
	const [open, setOpen] = useState(false);

	if (!note) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				title={note}
				aria-label={`Show full note: ${note.slice(0, 60)}`}
				className={cn(
					"group -mx-1.5 -my-1 flex max-w-[180px] items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[260px]",
					className,
				)}
			>
				<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground">
					{note}
				</span>
				<ExpandIcon className="size-3 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{subtitle && (
							<DialogDescription>{subtitle}</DialogDescription>
						)}
					</DialogHeader>
					<div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-surface-subtle/50 p-3">
						<p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
							{note}
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setOpen(false)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
