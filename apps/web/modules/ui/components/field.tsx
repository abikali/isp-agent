"use client";

import { Label } from "@ui/components/label";
import { cn } from "@ui/lib";
import { cva, type VariantProps } from "class-variance-authority";
import { useMemo } from "react";

const fieldVariants = cva(
	"group/field data-[invalid=true]:text-destructive flex w-full gap-3",
	{
		variants: {
			orientation: {
				vertical: ["flex-col [&>*]:w-full [&>.sr-only]:w-auto"],
				horizontal: [
					"flex-row items-center",
					"[&>[data-slot=field-label]]:flex-auto",
					"has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px has-[>[data-slot=field-content]]:items-start",
				],
				responsive: [
					"@md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto flex-col [&>*]:w-full [&>.sr-only]:w-auto",
					"@md/field-group:[&>[data-slot=field-label]]:flex-auto",
					"@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
				],
			},
		},
		defaultVariants: {
			orientation: "vertical",
		},
	},
);

function Field({
	className,
	orientation = "vertical",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: Official shadcn/ui Field component uses role="group" for form field grouping
		<div
			role="group"
			data-slot="field"
			data-orientation={orientation}
			className={cn(fieldVariants({ orientation }), className)}
			{...props}
		/>
	);
}

function FieldLabel({
	className,
	...props
}: React.ComponentProps<typeof Label>) {
	return (
		<Label
			data-slot="field-label"
			className={cn(
				"group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50",
				"has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>[data-slot=field]]:p-4",
				"has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10",
				className,
			)}
			{...props}
		/>
	);
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="field-description"
			className={cn(
				"text-muted-foreground text-sm font-normal leading-normal group-has-[[data-orientation=horizontal]]/field:text-balance",
				"nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5",
				"[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Normalizes TanStack Form errors to an array of strings.
 * Handles both inline validators (return strings) and Standard Schema validators (return { message: string }).
 */
function normalizeErrors(errors: readonly unknown[] | undefined): string[] {
	if (!errors || errors.length === 0) {
		return [];
	}

	return errors
		.filter((error): error is NonNullable<unknown> => error != null)
		.map((error) => {
			// Handle string errors (inline validators)
			if (typeof error === "string") {
				return error;
			}
			// Handle Standard Schema errors (zod validators)
			if (
				typeof error === "object" &&
				error !== null &&
				"message" in error &&
				typeof (error as { message: unknown }).message === "string"
			) {
				return (error as { message: string }).message;
			}
			// Fallback for unknown error types
			return String(error);
		})
		.filter((msg) => msg.length > 0);
}

function FieldError({
	className,
	children,
	errors,
	id,
	...props
}: React.ComponentProps<"div"> & {
	errors?: readonly unknown[];
}) {
	const normalizedErrors = useMemo(() => normalizeErrors(errors), [errors]);

	const content = useMemo(() => {
		if (children) {
			return children;
		}

		if (normalizedErrors.length === 0) {
			return null;
		}

		if (normalizedErrors.length === 1) {
			return normalizedErrors[0];
		}

		return (
			<ul className="ml-4 flex list-disc flex-col gap-1">
				{normalizedErrors.map((error, index) => (
					<li key={index}>{error}</li>
				))}
			</ul>
		);
	}, [children, normalizedErrors]);

	if (!content) {
		return null;
	}

	return (
		<div
			id={id}
			role="alert"
			aria-live="polite"
			data-slot="field-error"
			className={cn("text-destructive text-sm font-normal", className)}
			{...props}
		>
			{content}
		</div>
	);
}

export { Field, FieldLabel, FieldDescription, FieldError };
