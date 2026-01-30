import { cn } from "@ui/lib";
import * as React from "react";

const Textarea = ({
	className,
	...props
}: React.ComponentProps<"textarea">) => {
	return (
		<textarea
			className={cn(
				"flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors",
				"placeholder:text-muted-foreground",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-50",
				// Error state - red border when aria-invalid="true"
				"aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
				className,
			)}
			{...props}
		/>
	);
};

export { Textarea };
