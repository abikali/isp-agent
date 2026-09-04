"use client";

import { useConfirmationAlert } from "@saas/shared/client";
import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Switch } from "@ui/components/switch";
import { cn } from "@ui/lib";
import { PencilIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
	type RecurringLine,
	useDeleteRecurringExpense,
	useUpdateRecurringExpense,
} from "../../hooks/use-spending";

interface RecurringSectionProps {
	lines: RecurringLine[];
	total: number;
	canManage: boolean;
	onAdd: () => void;
	onEdit: (line: RecurringLine) => void;
}

function nextRun(line: RecurringLine, now = new Date()): string {
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth();
	const thisKey = `${y}-${String(m + 1).padStart(2, "0")}`;
	const dueThisMonth =
		line.lastGeneratedMonth !== thisKey &&
		now.getUTCDate() <= line.dayOfMonth;
	const target = dueThisMonth
		? new Date(Date.UTC(y, m, line.dayOfMonth))
		: new Date(Date.UTC(y, m + 1, line.dayOfMonth));
	return target.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
}

/**
 * The costs that come back every month, and what they add up to. This is
 * the owner's fixed-cost floor — the number revenue has to clear before
 * anything else counts.
 */
export function RecurringSection({
	lines,
	total,
	canManage,
	onAdd,
	onEdit,
}: RecurringSectionProps) {
	const organizationId = useOrganizationId();
	const update = useUpdateRecurringExpense();
	const remove = useDeleteRecurringExpense();
	const { confirm } = useConfirmationAlert();

	async function toggle(line: RecurringLine, active: boolean) {
		if (!organizationId) {
			return;
		}
		try {
			await update.mutateAsync({ organizationId, id: line.id, active });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not update",
			);
		}
	}

	function del(line: RecurringLine) {
		if (!organizationId) {
			return;
		}
		confirm({
			title: `Stop repeating "${line.description}"?`,
			message:
				"Months already on the books stay. Nothing new will be added.",
			confirmLabel: "Stop it",
			destructive: true,
			onConfirm: async () => {
				try {
					await remove.mutateAsync({ organizationId, id: line.id });
					toast.success("Removed.");
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Could not remove",
					);
				}
			},
		});
	}

	return (
		<ContentCard>
			<ContentCardSection className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
				<div>
					<div className="flex items-center gap-2 text-sm font-medium">
						<RepeatIcon className="size-4 text-muted-foreground" />
						Every month
					</div>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{lines.length === 0
							? "Costs that repeat at the same amount — rent, the upstream link, fees. Add them once."
							: `${formatCurrency(total)} a month before anything else. Filed automatically on each line's day.`}
					</p>
				</div>
				{canManage && (
					<Button size="sm" variant="outline" onClick={onAdd}>
						<RepeatIcon className="size-4" />
						Repeat monthly
					</Button>
				)}
			</ContentCardSection>
			{lines.length > 0 && (
				<ul>
					{lines.map((line) => (
						<li
							key={line.id}
							className={cn(
								"flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0",
								!line.active && "opacity-60",
							)}
						>
							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">
									{line.description}
								</div>
								<div className="truncate text-xs text-muted-foreground">
									{line.financeCategory?.label ??
										"Needs a bucket"}
									{" · "}
									{line.active
										? `next on ${nextRun(line)}`
										: "paused"}
								</div>
							</div>
							<span className="shrink-0 font-mono tabular-nums">
								{formatCurrency(line.amount)}
							</span>
							{canManage && (
								<div className="flex shrink-0 items-center gap-1">
									<Switch
										checked={line.active}
										onCheckedChange={(v) => toggle(line, v)}
										aria-label={
											line.active ? "Pause" : "Resume"
										}
									/>
									<Button
										size="sm"
										variant="ghost"
										className="h-7 px-2"
										onClick={() => onEdit(line)}
										aria-label="Edit"
									>
										<PencilIcon className="size-3.5" />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										className="h-7 px-2 text-destructive"
										onClick={() => del(line)}
										aria-label="Remove"
									>
										<Trash2Icon className="size-3.5" />
									</Button>
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</ContentCard>
	);
}
