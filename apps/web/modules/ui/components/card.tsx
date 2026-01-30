import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";

const cardVariants = cva(
	"rounded-xl border text-card-foreground transition-colors",
	{
		variants: {
			variant: {
				default: "bg-card border-border",
				glass: "bg-card/80 backdrop-blur-sm border-border/50",
				elevated: "bg-card border-border shadow-md",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

interface CardProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof cardVariants> {}

const Card = ({ className, variant, ...props }: CardProps) => (
	<div className={cn(cardVariants({ variant, className }))} {...props} />
);

const CardHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)}
		{...props}
	/>
);

const CardTitle = ({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
	<h3
		className={cn("font-semibold text-xl leading-none", className)}
		{...props}
	/>
);

const CardDescription = ({
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
	<p className={cn("text-muted-foreground text-sm", className)} {...props} />
);

const CardContent = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("p-6 pt-0", className)} {...props} />
);

const CardFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("flex items-center p-6 pt-0", className)} {...props} />
);

export {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
};
