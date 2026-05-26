"use client";

import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";

interface CustomerSaveBarProps {
	dirtyCount: number;
	isSubmitting: boolean;
	onDiscard: () => void;
	onSave: () => void;
}

/**
 * Sticky bottom bar that surfaces dirty-state for the customer edit form.
 * Only renders when there are unsaved changes — silent at rest.
 *
 * Saving a linked customer always mirrors personal-info changes to iRadius
 * (handled server-side in `updateCustomer`), so there is no opt-out toggle here.
 */
export function CustomerSaveBar({
	dirtyCount,
	isSubmitting,
	onDiscard,
	onSave,
}: CustomerSaveBarProps) {
	if (dirtyCount === 0 && !isSubmitting) {
		return null;
	}

	return (
		<div
			className={cn(
				"sticky bottom-0 z-20 -mx-6 mt-6 border-t border-border bg-background/85 px-6 py-3 backdrop-blur",
				"md:-mx-8 md:px-8",
			)}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2 text-sm">
					<span className="size-2 rounded-full bg-warning" />
					<span className="font-medium">
						{dirtyCount} unsaved{" "}
						{dirtyCount === 1 ? "change" : "changes"}
					</span>
				</div>

				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onDiscard}
							disabled={isSubmitting}
						>
							Discard
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={onSave}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Saving…" : "Save changes"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
