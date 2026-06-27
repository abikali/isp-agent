// biome-ignore-all lint/a11y/useFocusableInteractive: BreadcrumbPage uses role="link" for the current (non-navigable) page label — shadcn convention, not an interactive link
// biome-ignore-all lint/a11y/useSemanticElements: BreadcrumbPage is intentionally a span with role/aria-current, not an <a> (it's the current page, not a link)
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@ui/lib";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import * as React from "react";

const Breadcrumb = ({
	ref,
	...props
}: React.ComponentPropsWithoutRef<"nav"> & {
	separator?: React.ReactNode;
	ref?: React.Ref<HTMLElement>;
}) => <nav ref={ref} aria-label="breadcrumb" {...props} />;
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = ({
	className,
	ref,
	...props
}: React.ComponentPropsWithoutRef<"ol"> & {
	ref?: React.Ref<HTMLOListElement>;
}) => (
	<ol
		ref={ref}
		className={cn(
			"flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5",
			className,
		)}
		{...props}
	/>
);
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = ({
	className,
	ref,
	...props
}: React.ComponentPropsWithoutRef<"li"> & {
	ref?: React.Ref<HTMLLIElement>;
}) => (
	<li
		ref={ref}
		className={cn("inline-flex items-center gap-1.5", className)}
		{...props}
	/>
);
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = ({
	asChild,
	className,
	ref,
	...props
}: React.ComponentPropsWithoutRef<"a"> & {
	asChild?: boolean;
	ref?: React.Ref<HTMLAnchorElement>;
}) => {
	const Comp = asChild ? Slot : "a";

	return (
		<Comp
			ref={ref}
			className={cn("transition-colors hover:text-foreground", className)}
			{...props}
		/>
	);
};
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = ({
	className,
	ref,
	...props
}: React.ComponentPropsWithoutRef<"span"> & {
	ref?: React.Ref<HTMLSpanElement>;
}) => (
	// react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- BreadcrumbPage is the current (non-navigable) page label, intentionally a span with aria-current/aria-disabled, not an <a>
	<span
		ref={ref}
		role="link"
		aria-disabled="true"
		aria-current="page"
		className={cn("font-normal text-foreground", className)}
		{...props}
	/>
);
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = ({
	children,
	className,
	...props
}: React.ComponentProps<"li">) => (
	<li
		role="presentation"
		aria-hidden="true"
		className={cn("[&>svg]:w-3.5 [&>svg]:h-3.5", className)}
		{...props}
	>
		{children ?? <ChevronRight />}
	</li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = ({
	className,
	...props
}: React.ComponentProps<"span">) => (
	<span
		role="presentation"
		aria-hidden="true"
		className={cn("flex h-9 w-9 items-center justify-center", className)}
		{...props}
	>
		<MoreHorizontal className="h-4 w-4" />
		<span className="sr-only">More</span>
	</span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbElipssis";

export {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
	BreadcrumbEllipsis,
};
