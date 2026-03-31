import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageShellProps {
	title: string;
	description?: string;
	backTo?: string;
	backLabel?: string;
	actions?: ReactNode;
	badges?: ReactNode;
	subtitle?: ReactNode;
	children: ReactNode;
}

export function PageShell({
	title,
	description,
	backTo,
	backLabel,
	actions,
	badges,
	subtitle,
	children,
}: PageShellProps) {
	return (
		<div className="space-y-4 sm:space-y-6">
			{backTo && (
				<Link
					to={backTo}
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					preload="intent"
				>
					<ArrowLeftIcon className="size-4" />
					{backLabel ?? "Back"}
				</Link>
			)}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2 sm:gap-3">
						<h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
							{title}
						</h1>
						{badges}
					</div>
					{subtitle && (
						<div className="text-sm text-muted-foreground">
							{subtitle}
						</div>
					)}
					{description && (
						<p className="text-sm text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				{actions && (
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						{actions}
					</div>
				)}
			</div>
			{children}
		</div>
	);
}
