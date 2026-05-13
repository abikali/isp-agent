"use client";

import { Button, type ButtonProps } from "@ui/components/button";
import { cn } from "@ui/lib";
import { CheckIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export interface ActionButtonProps extends Omit<ButtonProps, "loading"> {
	/** Async work to perform on click. Loading state is managed automatically. */
	onAction?: () => void | Promise<void>;
	/** Show a brief checkmark state after a successful action. Default true. */
	showSuccess?: boolean;
	/** Custom success label rendered next to the check. Default keeps the original children. */
	successLabel?: ReactNode;
}

/**
 * Button variant that morphs label → spinner → checkmark when a mutation runs.
 *
 * Use for any destructive or important action where the user benefits from
 * a clear confirmation that the click landed. Reverts to its idle state
 * ~1.2s after success. Falls back to a normal button if `onAction` is omitted.
 */
export function ActionButton({
	onAction,
	showSuccess = true,
	successLabel,
	children,
	disabled,
	onClick,
	...buttonProps
}: ActionButtonProps) {
	const [status, setStatus] = useState<"idle" | "loading" | "success">(
		"idle",
	);

	useEffect(() => {
		if (status !== "success") {
			return;
		}
		const t = setTimeout(() => setStatus("idle"), 1200);
		return () => clearTimeout(t);
	}, [status]);

	async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
		if (onClick) {
			onClick(event);
		}
		if (!onAction) {
			return;
		}
		setStatus("loading");
		try {
			await onAction();
			setStatus(showSuccess ? "success" : "idle");
		} catch {
			setStatus("idle");
		}
	}

	return (
		<Button
			{...buttonProps}
			loading={status === "loading"}
			disabled={disabled || status === "loading"}
			onClick={handleClick}
			className={cn("transition-all", buttonProps.className)}
		>
			{status === "success" ? (
				<>
					<CheckIcon className="size-4" />
					{successLabel ?? children}
				</>
			) : (
				children
			)}
		</Button>
	);
}
