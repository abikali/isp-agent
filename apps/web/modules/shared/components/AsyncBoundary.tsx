"use client";

import type { DehydratedState } from "@tanstack/react-query";
import {
	HydrationBoundary,
	useQueryErrorResetBoundary,
} from "@tanstack/react-query";
import { type ErrorInfo, type ReactNode, Suspense, useCallback } from "react";
import {
	ErrorBoundary,
	FullPageErrorFallback,
	InlineErrorFallback,
} from "./ErrorBoundary";

type ErrorFallbackVariant = "default" | "inline" | "fullPage";

interface AsyncBoundaryProps {
	/** Content to render - typically a component using useSuspenseQuery */
	children: ReactNode;

	/** Suspense fallback (loading skeleton) - REQUIRED */
	fallback: ReactNode;

	/** Error fallback - variant name or custom ReactNode */
	errorFallback?: ErrorFallbackVariant | ReactNode;

	/** Callback when error is caught */
	onError?: (error: Error, errorInfo: ErrorInfo) => void;

	/** Dehydrated state for SSR hydration (optional) */
	dehydratedState?: DehydratedState | null;

	/** Reset error state when any of these values change */
	resetKeys?: unknown[];

	/** Custom className for error fallback container */
	errorClassName?: string;
}

/**
 * AsyncBoundary - Unified boundary for async data loading
 *
 * Combines ErrorBoundary + Suspense + optional HydrationBoundary
 * in the correct nesting order for React Query + SSR.
 *
 * Nesting order: ErrorBoundary > HydrationBoundary > Suspense > children
 *
 * @example Basic usage
 * ```tsx
 * <AsyncBoundary fallback={<ProfilesSkeleton />}>
 *   <ProfilesList />
 * </AsyncBoundary>
 * ```
 *
 * @example With SSR hydration
 * ```tsx
 * <AsyncBoundary
 *   fallback={<ProfilesSkeleton />}
 *   dehydratedState={loaderData.dehydratedState}
 * >
 *   <ProfilesList />
 * </AsyncBoundary>
 * ```
 *
 * @example With custom error variant
 * ```tsx
 * <AsyncBoundary
 *   fallback={<AnalyticsSkeleton />}
 *   errorFallback="inline"
 *   onError={(error) => logError(error)}
 * >
 *   <AnalyticsContent />
 * </AsyncBoundary>
 * ```
 */
export function AsyncBoundary({
	children,
	fallback,
	errorFallback = "default",
	onError,
	dehydratedState,
	resetKeys,
	errorClassName,
}: AsyncBoundaryProps) {
	const { reset } = useQueryErrorResetBoundary();

	// Render the error fallback based on variant or custom ReactNode
	const renderErrorFallback = useCallback(
		(error: Error | null, onResetError: () => void) => {
			// If it's a ReactNode (not a string variant), render it directly
			if (typeof errorFallback !== "string") {
				return errorFallback;
			}

			// Combined reset: reset both ErrorBoundary and React Query
			const combinedReset = () => {
				reset();
				onResetError();
			};

			switch (errorFallback) {
				case "inline":
					return (
						<InlineErrorFallback
							error={error}
							onReset={combinedReset}
							className={errorClassName}
						/>
					);
				case "fullPage":
					return (
						<FullPageErrorFallback
							error={error}
							onReset={combinedReset}
						/>
					);
				default:
					// Return undefined to let ErrorBoundary use its default fallback
					return undefined;
			}
		},
		[errorFallback, errorClassName, reset],
	);

	// Build the inner content with Suspense
	const suspenseContent = <Suspense fallback={fallback}>{children}</Suspense>;

	// Optionally wrap with HydrationBoundary
	const hydratedContent = dehydratedState ? (
		<HydrationBoundary state={dehydratedState}>
			{suspenseContent}
		</HydrationBoundary>
	) : (
		suspenseContent
	);

	// ErrorBoundary must be the outermost wrapper
	return (
		<ErrorBoundary
			fallbackRender={renderErrorFallback}
			onError={onError}
			onReset={reset}
			resetKeys={resetKeys}
		>
			{hydratedContent}
		</ErrorBoundary>
	);
}

export type { AsyncBoundaryProps, ErrorFallbackVariant };
