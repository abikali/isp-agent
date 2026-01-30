import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type React from "react";

export const badge = cva(
	[
		"inline-flex",
		"items-center",
		"rounded-md",
		"border",
		"px-2.5",
		"py-0.5",
		"text-xs",
		"font-medium",
		"transition-colors",
	],
	{
		variants: {
			variant: {
				default: [
					"border-transparent",
					"bg-primary",
					"text-primary-foreground",
				],
				secondary: [
					"border-transparent",
					"bg-secondary",
					"text-secondary-foreground",
				],
				outline: ["border-border", "text-foreground"],
				success: ["border-success/20", "bg-success/10", "text-success"],
				warning: [
					"border-amber-500/20",
					"bg-amber-500/10",
					"text-amber-500",
				],
				info: [
					"border-blue-500/20",
					"bg-blue-500/10",
					"text-blue-600",
					"dark:text-blue-400",
				],
				error: [
					"border-destructive/20",
					"bg-destructive/10",
					"text-destructive",
				],
				destructive: [
					"border-destructive/20",
					"bg-destructive/10",
					"text-destructive",
				],
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export type BadgeProps = React.HtmlHTMLAttributes<HTMLDivElement> &
	VariantProps<typeof badge>;

export const Badge = ({
	children,
	className,
	variant,
	...props
}: BadgeProps) => (
	<span className={cn(badge({ variant }), className)} {...props}>
		{children}
	</span>
);

Badge.displayName = "Badge";
