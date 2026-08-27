"use client";

import { cn } from "@ui/lib";
import { ChevronDownIcon, WrenchIcon } from "lucide-react";
import { useState } from "react";

function formatToolResult(result: unknown): string {
	if (typeof result === "string") {
		return result;
	}
	return JSON.stringify(result, null, 2);
}

/** Collapsible pill showing a tool call with its input and result. */
export interface ToolCallData {
	toolCallId: string;
	toolName: string;
	args: unknown;
	result: unknown;
}

export function ToolCallPill({ toolCall }: { toolCall: ToolCallData }) {
	const [isOpen, setIsOpen] = useState(false);

	const displayName = toolCall.toolName
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());

	return (
		<div className="min-w-0 overflow-hidden rounded-md border bg-background/50 text-xs">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-muted/50"
			>
				<WrenchIcon className="size-3 shrink-0 text-muted-foreground" />
				<span className="flex-1 truncate font-medium">
					{displayName}
				</span>
				<ChevronDownIcon
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</button>
			{isOpen && (
				<div className="space-y-1.5 border-t px-2 py-1.5">
					{toolCall.args != null &&
						Object.keys(toolCall.args as object).length > 0 && (
							<div>
								<span className="font-medium text-muted-foreground">
									Input
								</span>
								<pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-[10px]">
									{JSON.stringify(toolCall.args, null, 2)}
								</pre>
							</div>
						)}
					{toolCall.result != null && (
						<div>
							<span className="font-medium text-muted-foreground">
								Result
							</span>
							<pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-[10px]">
								{formatToolResult(toolCall.result)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
