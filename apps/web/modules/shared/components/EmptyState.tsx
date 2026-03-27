import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
	icon?: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
}

export function EmptyState({
	icon: Icon = InboxIcon,
	title,
	description,
	action,
}: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
			<Icon className="mb-4 size-10 text-muted-foreground" />
			<h3 className="mb-1 text-lg font-medium">{title}</h3>
			{description && (
				<p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
					{description}
				</p>
			)}
			{action}
		</div>
	);
}
