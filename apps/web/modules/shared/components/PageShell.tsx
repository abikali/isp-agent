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
		<div className="space-y-6">
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
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 space-y-1">
					<div className="flex items-center gap-3">
						<h1 className="truncate text-2xl font-semibold tracking-tight">
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
					<div className="flex shrink-0 items-center gap-2">
						{actions}
					</div>
				)}
			</div>
			{children}
		</div>
	);
}
