"use client";

import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Label } from "@ui/components/label";
import { cn } from "@ui/lib";

interface CustomerSaveBarProps {
	dirtyCount: number;
	isSubmitting: boolean;
	canMirrorIRadius: boolean;
	syncToIRadius: boolean;
	onToggleSync: (next: boolean) => void;
	onDiscard: () => void;
	onSave: () => void;
}

/**
 * Sticky bottom bar that surfaces dirty-state for the customer edit form.
 * Only renders when there are unsaved changes — silent at rest.
 *
 * Replaces the old "Save to iRadius?" confirmation dialog: the choice is
 * presented up-front as a pre-checked checkbox so save = save everywhere by
 * default, and the rare "panel only" case is one click away.
 */
export function CustomerSaveBar({
	dirtyCount,
	isSubmitting,
	canMirrorIRadius,
	syncToIRadius,
	onToggleSync,
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
					{canMirrorIRadius && (
						<div className="flex items-center gap-2">
							<Checkbox
								id="sync-to-iradius"
								checked={syncToIRadius}
								onCheckedChange={(v) =>
									onToggleSync(v === true)
								}
							/>
							<Label
								htmlFor="sync-to-iradius"
								className="cursor-pointer text-sm font-normal text-muted-foreground"
							>
								Also update iRadius
							</Label>
						</div>
					)}
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
