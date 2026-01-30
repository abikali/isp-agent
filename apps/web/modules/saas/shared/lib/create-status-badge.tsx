"use client";

import type { BadgeProps } from "@ui/components/badge";
import { Badge } from "@ui/components/badge";
import { cn } from "@ui/lib";

/**
 * Status configuration for a single status value
 */
export interface StatusConfig {
	/** Label to display */
	label: string;
	/** Badge variant */
	variant: BadgeProps["variant"];
}

/**
 * Creates a type-safe status badge component for a specific status type.
 *
 * @example
 * ```tsx
 * // Define your status type
 * type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
 *
 * // Create the badge component
 * export const OrderStatusBadge = createStatusBadge<OrderStatus>({
 *   pending: { label: "Pending", variant: "secondary" },
 *   processing: { label: "Processing", variant: "info" },
 *   shipped: { label: "Shipped", variant: "success" },
 *   delivered: { label: "Delivered", variant: "success" },
 *   cancelled: { label: "Cancelled", variant: "destructive" },
 * });
 *
 * // Usage
 * <OrderStatusBadge status="shipped" />
 * ```
 */
export function createStatusBadge<T extends string>(
	config: Record<T, StatusConfig>,
	options?: {
		/** Default status to use if status not found in config */
		defaultStatus?: T;
		/** Default class name to apply */
		className?: string;
		/** Whether to capitalize the label */
		capitalize?: boolean;
	},
) {
	const {
		defaultStatus,
		className: defaultClassName,
		capitalize = false,
	} = options ?? {};

	return function StatusBadge({
		status,
		className,
	}: {
		status: T;
		className?: string;
	}) {
		const statusConfig =
			config[status] ?? (defaultStatus ? config[defaultStatus] : null);

		if (!statusConfig) {
			return null;
		}

		return (
			<Badge
				variant={statusConfig.variant}
				className={cn(
					defaultClassName,
					capitalize && "capitalize",
					className,
				)}
			>
				{statusConfig.label}
			</Badge>
		);
	};
}

/**
 * Creates a status badge component with dynamic/i18n labels.
 * Use this when labels need to be translated or computed at runtime.
 *
 * @example
 * ```tsx
 * export function OrderStatusBadge({ status }: { status: OrderStatus }) {
 *   const t = useTranslations();
 *
 *   return createStatusBadgeDynamic({
 *     status,
 *     label: t(`orders.status.${status}`),
 *     variant: ORDER_STATUS_VARIANTS[status],
 *   });
 * }
 * ```
 */
export function createStatusBadgeDynamic({
	status,
	label,
	variant,
	className,
}: {
	status: string;
	label: string;
	variant: BadgeProps["variant"];
	className?: string;
}) {
	return (
		<Badge variant={variant} className={className} data-status={status}>
			{label}
		</Badge>
	);
}

/**
 * Common badge variants for reuse across different status types
 */
export const BadgeVariants = {
	// Success states
	success: "success" as const,
	active: "success" as const,
	completed: "success" as const,

	// Info states
	info: "info" as const,
	pending: "info" as const,
	processing: "info" as const,

	// Warning states
	warning: "warning" as const,
	paused: "warning" as const,
	incomplete: "warning" as const,

	// Error/Destructive states
	error: "error" as const,
	destructive: "destructive" as const,
	cancelled: "destructive" as const,
	expired: "error" as const,

	// Neutral states
	default: "default" as const,
	secondary: "secondary" as const,
	outline: "outline" as const,
} as const;
