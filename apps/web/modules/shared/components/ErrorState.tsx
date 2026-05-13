"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

export interface ErrorStateProps {
	title?: string;
	description?: string;
	error?: Error | null;
	onRetry?: () => void;
	className?: string;
}

/**
 * Shared error state used by AsyncBoundary and ad-hoc error surfaces.
 *
 * Shows a friendly headline + description + retry. Dev-only `<details>`
 * block exposes the underlying error message and stack so developers can
 * diagnose without opening devtools.
 */
export function ErrorState({
	title = "Something went wrong",
	description = "Please try again. If the problem persists, contact support.",
	error,
	onRetry,
	className,
}: ErrorStateProps) {
	const showDevDetails =
		typeof import.meta !== "undefined" && import.meta.env?.DEV && error;

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
				className,
			)}
		>
			<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
				<AlertTriangleIcon className="size-5" />
			</div>
			<h3 className="text-base font-medium tracking-tight text-foreground">
				{title}
			</h3>
			<p className="mt-1 max-w-md text-sm text-muted-foreground">
				{description}
			</p>
			{onRetry && (
				<Button
					onClick={onRetry}
					size="sm"
					variant="outline"
					className="mt-5"
				>
					<RefreshCwIcon className="size-4" />
					Try again
				</Button>
			)}
			{showDevDetails && (
				<details className="mt-6 w-full max-w-xl text-left">
					<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
						Error details (dev only)
					</summary>
					<pre className="mt-2 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
						{error?.message}
						{error?.stack && `\n\n${error.stack}`}
					</pre>
				</details>
			)}
		</div>
	);
}
