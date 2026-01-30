import { Slot, Slottable } from "@radix-ui/react-slot";
import { Spinner } from "@shared/components/Spinner";
import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				primary:
					"border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98]",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				outline:
					"border border-input bg-background hover:bg-accent hover:text-accent-foreground",
				ghost: "border-transparent hover:bg-accent hover:text-accent-foreground",
				link: "border-transparent text-foreground underline-offset-4 hover:underline",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
			},
			size: {
				sm: "h-8 rounded-md px-3 text-xs",
				md: "h-9 rounded-md px-4 text-sm",
				lg: "h-10 rounded-md px-6 text-sm",
				icon: "size-9 rounded-md",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "md",
		},
	},
);

export type ButtonProps = {
	asChild?: boolean;
	loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants>;

const Button = ({
	className,
	children,
	variant,
	size,
	asChild = false,
	loading,
	disabled,
	...props
}: ButtonProps) => {
	const Comp = asChild ? Slot : "button";
	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			disabled={disabled || loading}
			{...props}
		>
			{loading && <Spinner className="size-4 text-inherit" />}
			<Slottable>{children}</Slottable>
		</Comp>
	);
};

export { Button, buttonVariants };
