import { Slot, Slottable } from "@radix-ui/react-slot";
import { Spinner } from "@shared/components/Spinner";
import { buttonVariants } from "@ui/components/button-variants";
import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

export type ButtonProps = {
	asChild?: boolean;
	loading?: boolean;
	ref?: React.Ref<HTMLButtonElement>;
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
	ref,
	...props
}: ButtonProps) => {
	const Comp = asChild ? Slot : "button";
	return (
		<Comp
			ref={ref}
			className={cn(buttonVariants({ variant, size, className }))}
			disabled={disabled || loading}
			{...props}
		>
			{loading && <Spinner className="size-4 text-inherit" />}
			<Slottable>{children}</Slottable>
		</Comp>
	);
};

export { Button };
