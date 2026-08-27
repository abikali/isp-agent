"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Progress } from "@ui/components/progress";
import { cn } from "@ui/lib";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMoneyMap, useSaveMoneyMap } from "../hooks/use-finance";

interface MoneyMapWizardProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * "Set up your money map" — one question per real spending line.
 *
 * This exists instead of a settings screen because the person who knows what
 * "Wasil l chady" is has never opened a settings screen, and because the two
 * biggest unknowns in this business ($52k/month of upstream bandwidth and a
 * $13,200/month standing payment) are things only he can classify.
 *
 * Design rules:
 *   · One line at a time. A grid of 40 rows is a form; one card is a question.
 *   · Show the real money. "Wasil l chady — $13,200 every month, 4 months
 *     running" is answerable; "wasil_l_chady" is not.
 *   · Always skippable. A half-finished map is more useful than an abandoned
 *     one, and the page says plainly what is still unsorted.
 */
export function MoneyMapWizard({ open, onOpenChange }: MoneyMapWizardProps) {
	const organizationId = useOrganizationId();
	const { categories, lines, isLoading } = useMoneyMap(open);
	const save = useSaveMoneyMap();

	const [index, setIndex] = useState(0);
	const [picks, setPicks] = useState<Record<string, string>>({});

	// Only ask about what is still unanswered — re-opening the wizard after
	// classifying everything should not walk the whole list again.
	const queue = useMemo(
		() => lines.filter((line) => !line.financeCategoryId),
		[lines],
	);

	const current = queue[index];
	const answered = Object.keys(picks).length;
	const done = index >= queue.length;

	function choose(categoryId: string) {
		if (!current) {
			return;
		}
		setPicks((prev) => ({ ...prev, [current.key]: categoryId }));
		setIndex((i) => i + 1);
	}

	function handleSave() {
		const assignments = queue.flatMap((line) => {
			const financeCategoryId = picks[line.key];
			return financeCategoryId
				? [{ key: line.key, label: line.label, financeCategoryId }]
				: [];
		});

		if (assignments.length === 0 || !organizationId) {
			onOpenChange(false);
			return;
		}

		save.mutate(
			{ organizationId, assignments },
			{
				onSuccess: (result) => {
					toast.success(
						result.expensesBackfilled > 0
							? `Saved. ${result.expensesBackfilled} past entries were sorted too.`
							: "Saved.",
					);
					onOpenChange(false);
					setIndex(0);
					setPicks({});
				},
				onError: () => {
					toast.error("Could not save. Please try again.");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Sort your spending</DialogTitle>
					<DialogDescription>
						Tell us what each of these payments is for. We'll
						remember, and sort everything like it automatically.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="flex items-center justify-center py-12 text-muted-foreground">
						<Loader2Icon className="size-5 animate-spin" />
					</div>
				) : queue.length === 0 ? (
					<Empty />
				) : done ? (
					<Finished count={answered} />
				) : current ? (
					<>
						<div className="space-y-1.5">
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<span>
									Question {index + 1} of {queue.length}
								</span>
								<span className="tabular-nums">
									{Math.round((index / queue.length) * 100)}%
								</span>
							</div>
							<Progress
								value={(index / queue.length) * 100}
								className="h-1"
							/>
						</div>

						<div className="rounded-lg border border-border bg-muted/40 p-4">
							<div className="text-base font-medium">
								{current.label}
							</div>
							<div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								<span className="font-medium tabular-nums text-foreground">
									{formatCurrency(
										Math.round(current.monthlyAverage),
									)}
								</span>
								<span>a month</span>
								{current.monthsSeen > 1 && (
									<Badge variant="secondary">
										{current.monthsSeen} months running
									</Badge>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<p className="text-sm font-medium">
								What is this payment for?
							</p>
							<div className="grid gap-1.5">
								{categories.map((category) => (
									<button
										key={category.id}
										type="button"
										onClick={() => choose(category.id)}
										className={cn(
											"rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors",
											"hover:border-primary/50 hover:bg-primary/[0.04]",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										)}
									>
										<div className="text-sm font-medium">
											{category.label}
										</div>
										{category.hint && (
											<div className="mt-0.5 text-xs text-muted-foreground">
												{category.hint}
											</div>
										)}
									</button>
								))}
							</div>
						</div>
					</>
				) : null}

				<DialogFooter className="gap-2 sm:justify-between">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						{answered > 0 ? "Finish later" : "Not now"}
					</Button>
					<div className="flex gap-2">
						{!done && queue.length > 0 && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setIndex((i) => i + 1)}
							>
								Skip this one
							</Button>
						)}
						{answered > 0 && (
							<Button
								size="sm"
								onClick={handleSave}
								disabled={save.isPending}
							>
								{save.isPending && (
									<Loader2Icon className="size-4 animate-spin" />
								)}
								Save {answered}{" "}
								{answered === 1 ? "answer" : "answers"}
							</Button>
						)}
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Empty() {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success">
				<CheckIcon className="size-5" />
			</div>
			<p className="text-sm font-medium">Everything is sorted</p>
			<p className="max-w-xs text-pretty text-sm text-muted-foreground">
				All of your regular payments have a category. New ones will be
				sorted automatically.
			</p>
		</div>
	);
}

function Finished({ count }: { count: number }) {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success">
				<CheckIcon className="size-5" />
			</div>
			<p className="text-sm font-medium">
				{count} {count === 1 ? "answer" : "answers"} ready to save
			</p>
			<p className="max-w-xs text-pretty text-sm text-muted-foreground">
				We'll also go back and sort every past payment that matches.
			</p>
		</div>
	);
}
