"use client";

import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Card } from "@ui/components/card";
import { Input } from "@ui/components/input";
import { BanknoteIcon } from "lucide-react";

export function HandoffCard({
	balance,
	handoffForm,
	isSubmittingHandoff,
	onCollectAll,
}: {
	balance: number;
	// biome-ignore lint/suspicious/noExplicitAny: TanStack Form generic is too complex to type inline
	handoffForm: any;
	isSubmittingHandoff: boolean;
	onCollectAll: () => void;
}) {
	return (
		<Card className="border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10 overflow-hidden">
			<div className="px-4 py-3">
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- client-side TanStack Form submitting via oRPC mutation; no server action exists, preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handoffForm.handleSubmit();
					}}
					className="flex flex-wrap items-end gap-2"
				>
					<handoffForm.Field name="amount">
						{(field: {
							state: { value: string };
							handleChange: (v: string) => void;
						}) => (
							<div className="flex items-center gap-1.5">
								<Input
									type="number"
									step="0.01"
									min="0.01"
									placeholder="0.00"
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
									className="w-28 h-8 text-sm"
									required
								/>
								{balance > 0 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 shrink-0 text-xs"
										onClick={onCollectAll}
									>
										All ({formatCurrency(balance)})
									</Button>
								)}
							</div>
						)}
					</handoffForm.Field>
					<handoffForm.Field name="notes">
						{(field: {
							state: { value: string };
							handleChange: (v: string) => void;
						}) => (
							<Input
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value)
								}
								placeholder="Note (optional)"
								className="h-8 text-sm flex-1 min-w-[120px]"
							/>
						)}
					</handoffForm.Field>
					<Button
						type="submit"
						size="sm"
						disabled={isSubmittingHandoff}
						className="h-8 shrink-0"
					>
						<BanknoteIcon className="mr-1.5 size-3.5" />
						{isSubmittingHandoff
							? "Recording..."
							: "Record Handoff"}
					</Button>
				</form>
			</div>
		</Card>
	);
}
