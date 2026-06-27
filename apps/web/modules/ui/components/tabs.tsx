"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@ui/lib";
import * as React from "react";

const Tabs = TabsPrimitive.Root;

const TabsList = ({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
	<TabsPrimitive.List
		className={cn(
			"inline-flex h-10 w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground sm:w-auto sm:justify-center",
			className,
		)}
		{...props}
	/>
);

// react-doctor-disable-next-line react-doctor/no-multi-comp -- shadcn/ui tabs barrel of related primitives
const TabsTrigger = ({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
	<TabsPrimitive.Trigger
		className={cn(
			"inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all",
			"ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
			"disabled:pointer-events-none disabled:opacity-50",
			"hover:text-foreground",
			"data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
			className,
		)}
		{...props}
	/>
);

// react-doctor-disable-next-line react-doctor/no-multi-comp -- shadcn/ui tabs barrel of related primitives
const TabsContent = ({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) => (
	<TabsPrimitive.Content
		className={cn(
			"mt-2 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
			className,
		)}
		{...props}
	/>
);

export { Tabs, TabsContent, TabsList, TabsTrigger };
