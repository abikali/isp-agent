"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { toggleVariants } from "@ui/components/toggle-variants";
import { cn } from "@ui/lib";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { use } from "react";

const ToggleGroupContext = React.createContext<
	VariantProps<typeof toggleVariants>
>({
	size: "default",
	variant: "default",
});

function ToggleGroup({
	className,
	variant,
	size,
	children,
	ref,
	...props
}: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root> &
	VariantProps<typeof toggleVariants> & {
		ref?: React.Ref<React.ComponentRef<typeof ToggleGroupPrimitive.Root>>;
	}) {
	const contextValue = React.useMemo(
		() => ({ variant, size }),
		[variant, size],
	);

	return (
		<ToggleGroupPrimitive.Root
			ref={ref}
			className={cn("flex items-center justify-center gap-1", className)}
			{...props}
		>
			<ToggleGroupContext.Provider value={contextValue}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive.Root>
	);
}

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

function ToggleGroupItem({
	className,
	children,
	variant,
	size,
	ref,
	...props
}: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
	VariantProps<typeof toggleVariants> & {
		ref?: React.Ref<React.ComponentRef<typeof ToggleGroupPrimitive.Item>>;
	}) {
	const context = use(ToggleGroupContext);

	return (
		<ToggleGroupPrimitive.Item
			ref={ref}
			className={cn(
				toggleVariants({
					variant: context.variant || variant,
					size: context.size || size,
				}),
				className,
			)}
			{...props}
		>
			{children}
		</ToggleGroupPrimitive.Item>
	);
}

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
