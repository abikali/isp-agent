// biome-ignore-all lint/a11y/useSemanticElements: shadcn/ui Field uses role="group" for form-field grouping; no clean native equivalent (<fieldset> changes layout/semantics)
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
		// react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- role="group" has no clean native HTML equivalent (<address>/<fieldset> change semantics); intentional per shadcn/ui Field
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

// react-doctor-disable-next-line react-doctor/no-multi-comp -- shadcn/ui field barrel of related primitives
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

	return errors.reduce<string[]>((acc, error) => {
		if (error == null) {
			return acc;
		}
		let msg: string;
		// Handle string errors (inline validators)
		if (typeof error === "string") {
			msg = error;
		} else if (
			// Handle Standard Schema errors (zod validators)
			typeof error === "object" &&
			"message" in error &&
			typeof (error as { message: unknown }).message === "string"
		) {
			msg = (error as { message: string }).message;
		} else {
			// Fallback for unknown error types
			msg = String(error);
		}
		if (msg.length > 0) {
			acc.push(msg);
		}
		return acc;
	}, []);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- shadcn/ui field barrel of related primitives
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

	if (!children && normalizedErrors.length === 0) {
		return null;
	}

	let content: React.ReactNode = children;
	if (!children) {
		content =
			normalizedErrors.length === 1 ? (
				normalizedErrors[0]
			) : (
				<ul className="ml-4 flex list-disc flex-col gap-1">
					{normalizedErrors.map((error) => (
						<li key={error}>{error}</li>
					))}
				</ul>
			);
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
