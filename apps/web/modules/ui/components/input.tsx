import { cn } from "@ui/lib";
import React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = ({ className, type, ...props }: InputProps) => {
	return (
		<input
			type={type}
			className={cn(
				"flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
				"file:border-0 file:bg-transparent file:text-sm file:font-medium",
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

export { Input };
