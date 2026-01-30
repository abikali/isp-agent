"use client";

import * as Sentry from "@sentry/tanstackstart-react";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	/** Function to render fallback dynamically with error and reset function */
	fallbackRender?: (error: Error | null, onReset: () => void) => ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
	/** Callback when error is reset */
	onReset?: () => void;
	className?: string;
	/** Reset error state when any of these values change */
	resetKeys?: unknown[];
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Provides a fallback UI and optional error reporting.
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Log error to console in development
		if (process.env.NODE_ENV === "development") {
			// biome-ignore lint/suspicious/noConsole: Intentional error logging for development debugging
			console.error("ErrorBoundary caught an error:", error, errorInfo);
		}

		// Report error to Sentry
		Sentry.captureException(error, {
			extra: {
				componentStack: errorInfo.componentStack,
			},
		});

		// Call optional error handler (for error reporting services)
		this.props.onError?.(error, errorInfo);
	}

	override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
		// Reset error state when resetKeys change
		if (this.state.hasError && this.props.resetKeys) {
			const keysChanged =
				!prevProps.resetKeys ||
				this.props.resetKeys.length !== prevProps.resetKeys.length ||
				this.props.resetKeys.some(
					(key, index) => key !== prevProps.resetKeys?.[index],
				);

			if (keysChanged) {
				this.props.onReset?.();
				this.setState({ hasError: false, error: null });
			}
		}
	}

	handleReset = (): void => {
		this.props.onReset?.();
		this.setState({ hasError: false, error: null });
	};

	override render(): ReactNode {
		if (this.state.hasError) {
			// Use fallbackRender if provided (dynamic fallback)
			if (this.props.fallbackRender) {
				const rendered = this.props.fallbackRender(
					this.state.error,
					this.handleReset,
				);
				// Only use rendered result if it's not undefined
				if (rendered !== undefined) {
					return rendered;
				}
			}

			// Use static fallback if provided
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// Default fallback UI
			return (
				<DefaultErrorFallback
					error={this.state.error}
					onReset={this.handleReset}
					className={this.props.className}
				/>
			);
		}

		return this.props.children;
	}
}

interface DefaultErrorFallbackProps {
	error: Error | null;
	onReset: () => void;
	className?: string;
}

function DefaultErrorFallback({
	error,
	onReset,
	className,
}: DefaultErrorFallbackProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center",
				className,
			)}
			role="alert"
			aria-live="assertive"
		>
			<AlertTriangle className="mb-4 h-12 w-12 text-destructive" />
			<h2 className="mb-2 text-lg font-semibold text-foreground">
				Something went wrong
			</h2>
			<p className="mb-4 max-w-md text-sm text-muted-foreground">
				{error?.message ||
					"An unexpected error occurred. Please try again."}
			</p>
			<Button
				onClick={onReset}
				variant="outline"
				size="sm"
				className="gap-2"
			>
				<RefreshCw className="h-4 w-4" />
				Try again
			</Button>
		</div>
	);
}

/**
 * Compact error fallback for inline use
 */
export function InlineErrorFallback({
	error,
	onReset,
	className,
}: DefaultErrorFallbackProps) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3",
				className,
			)}
			role="alert"
		>
			<AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
			<span className="flex-1 text-sm text-muted-foreground">
				{error?.message || "Error loading content"}
			</span>
			<Button
				onClick={onReset}
				variant="ghost"
				size="sm"
				className="h-auto px-2 py-1"
			>
				Retry
			</Button>
		</div>
	);
}

/**
 * Full page error fallback for critical failures
 */
export function FullPageErrorFallback({
	error,
	onReset,
}: DefaultErrorFallbackProps) {
	return (
		<div
			className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center"
			role="alert"
			aria-live="assertive"
		>
			<AlertTriangle className="mb-6 h-16 w-16 text-destructive" />
			<h1 className="mb-3 text-2xl font-bold text-foreground">
				Oops! Something went wrong
			</h1>
			<p className="mb-6 max-w-lg text-muted-foreground">
				We encountered an unexpected error. Our team has been notified
				and is working on a fix.
			</p>
			{process.env.NODE_ENV === "development" && error && (
				<pre className="mb-6 max-w-lg overflow-auto rounded-md bg-muted p-4 text-left text-xs">
					{error.message}
				</pre>
			)}
			<div className="flex gap-3">
				<Button onClick={onReset} className="gap-2">
					<RefreshCw className="h-4 w-4" />
					Try again
				</Button>
				<Button
					variant="outline"
					onClick={() => window.location.reload()}
				>
					Reload page
				</Button>
			</div>
		</div>
	);
}
