"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as VisuallyHiddenPrimitive from "@radix-ui/react-visually-hidden";
import { cn } from "@ui/lib";
import { XIcon } from "lucide-react";
import * as React from "react";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = ({ ...props }: DialogPrimitive.DialogPortalProps) => (
	<DialogPrimitive.Portal {...props} />
);

const DialogOverlay = ({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) => (
	<DialogPrimitive.Overlay
		className={cn(
			"fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
			"data-[state=open]:animate-in data-[state=closed]:animate-out",
			"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
);

const VisuallyHidden = VisuallyHiddenPrimitive.Root;

interface DialogContentProps
	extends React.ComponentProps<typeof DialogPrimitive.Content> {
	/**
	 * Accessible title for screen readers when DialogTitle is not visible.
	 * Use this when you want to hide the visual title but need accessibility.
	 */
	accessibleTitle?: string;
	/**
	 * Accessible description for screen readers when DialogDescription is not visible.
	 */
	accessibleDescription?: string;
	/**
	 * Whether to show the close button. Defaults to true.
	 */
	showCloseButton?: boolean;
}

const DialogContent = ({
	className,
	children,
	accessibleTitle,
	accessibleDescription,
	showCloseButton = true,
	...props
}: DialogContentProps) => (
	<DialogPortal>
		<DialogOverlay />
		<DialogPrimitive.Content
			className={cn(
				"fixed left-[50%] top-[50%] z-50 flex w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] flex-col gap-4 sm:w-full",
				"max-h-[calc(100dvh-2rem)] overflow-y-auto",
				"rounded-xl border border-border bg-background p-6 shadow-lg",
				"duration-200",
				"data-[state=open]:animate-in data-[state=closed]:animate-out",
				"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				"data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
				"data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
				"data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
				className,
			)}
			{...props}
		>
			{/* Hidden accessible title for screen readers when no visible DialogTitle */}
			{accessibleTitle && (
				<VisuallyHidden asChild>
					<DialogPrimitive.Title>
						{accessibleTitle}
					</DialogPrimitive.Title>
				</VisuallyHidden>
			)}
			{/* Hidden accessible description for screen readers */}
			{accessibleDescription && (
				<VisuallyHidden asChild>
					<DialogPrimitive.Description>
						{accessibleDescription}
					</DialogPrimitive.Description>
				</VisuallyHidden>
			)}
			{children}
			{showCloseButton && (
				<DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
					<XIcon className="size-4" />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			)}
		</DialogPrimitive.Content>
	</DialogPortal>
);

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left",
			className,
		)}
		{...props}
	/>
);

const DialogFooter = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
			className,
		)}
		{...props}
	/>
);

const DialogTitle = ({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) => (
	<DialogPrimitive.Title
		className={cn(
			"font-semibold text-lg leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
);

const DialogDescription = ({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) => (
	<DialogPrimitive.Description
		className={cn("text-muted-foreground text-sm", className)}
		{...props}
	/>
);

export {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
};
