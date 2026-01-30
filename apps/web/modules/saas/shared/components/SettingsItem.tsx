import { Card } from "@ui/components/card";
import { cn } from "@ui/lib";
import type { PropsWithChildren, ReactNode } from "react";

export function SettingsItem({
	children,
	title,
	description,
	danger,
	fullWidth,
}: PropsWithChildren<{
	title: string | ReactNode;
	description?: string | ReactNode;
	danger?: boolean;
	/**
	 * When true, stacks title and content vertically for full-width content like tables.
	 * Useful for data-heavy components that need maximum horizontal space.
	 */
	fullWidth?: boolean;
}>) {
	return (
		<Card className="@container rounded-xl border border-border p-4 md:p-6">
			<div
				className={cn(
					"grid grid-cols-1 gap-4",
					!fullWidth &&
						"@xl:grid-cols-[min(100%/3,280px)_auto] @xl:gap-8",
				)}
			>
				<div className="flex shrink-0 flex-col gap-1">
					<h3
						className={cn(
							"m-0 font-medium leading-tight",
							danger && "text-destructive",
						)}
					>
						{title}
					</h3>
					{description && (
						<p className="m-0 text-muted-foreground text-sm">
							{description}
						</p>
					)}
				</div>
				{children}
			</div>
		</Card>
	);
}
