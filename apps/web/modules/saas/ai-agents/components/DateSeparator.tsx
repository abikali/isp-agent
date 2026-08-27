"use client";

/** Centered date separator pill between message groups. */
export function DateSeparator({ date }: { date: string }) {
	return (
		<div className="flex items-center justify-center py-2">
			<span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
				{date}
			</span>
		</div>
	);
}
