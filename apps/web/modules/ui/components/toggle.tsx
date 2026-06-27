"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import { toggleVariants } from "@ui/components/toggle-variants";
import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";

function Toggle({
	className,
	variant,
	size,
	ref,
	...props
}: React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
	VariantProps<typeof toggleVariants> & {
		ref?: React.Ref<React.ComponentRef<typeof TogglePrimitive.Root>>;
	}) {
	return (
		<TogglePrimitive.Root
			ref={ref}
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle };
