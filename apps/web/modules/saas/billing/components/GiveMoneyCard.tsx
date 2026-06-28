"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useForm, useStore } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { cn } from "@ui/lib";
import { BanknoteIcon } from "lucide-react";
import { toast } from "sonner";
import { usePaySalary } from "../hooks/use-billing";

// ─── Give money card ─────────────────────────────────────────────────
//
// Shared by the worker and collector detail pages. Records a "from → to"
// money move for an employee. See `expenses.paySalary` for the ledger rules.

type CashFrom = "company" | "collected";
type CashTo = "in_hand" | "him";

const FROM_OPTIONS: { value: CashFrom; label: string }[] = [
	{ value: "company", label: "Company cash" },
	{ value: "collected", label: "His collected cash" },
];
const TO_OPTIONS: { value: CashTo; label: string }[] = [
	{ value: "in_hand", label: "His cash in hand (he owes it back)" },
	{ value: "him", label: "Him — his to keep (pay)" },
];

/** Net effect of a from→to move on his cash in hand + the books. */
function cashEffect(from: CashFrom, to: CashTo, amount: number) {
	// Moving his own collected cash into his cash in hand is a no-op.
	const invalid = from === "collected" && to === "in_hand";
	const inHandDelta =
		to === "in_hand" ? amount : from === "collected" ? -amount : 0;
	return { invalid, inHandDelta, isExpense: to === "him" };
}

export function GiveMoneyCard({
	employeeId,
	balance,
	className,
}: {
	employeeId: string;
	balance: number;
	className?: string;
}) {
	const organizationId = useOrganizationId();
	const paySalary = usePaySalary();

	const form = useForm({
		defaultValues: {
			amount: "",
			notes: "",
			from: "company" as CashFrom,
			to: "in_hand" as CashTo,
		},
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				return;
			}
			toast.promise(
				paySalary.mutateAsync({
					organizationId,
					workerId: employeeId,
					amount: Number(value.amount),
					notes: value.notes || undefined,
					from: value.from,
					to: value.to,
				}),
				{
					loading: "Recording…",
					success: () => {
						form.reset();
						return "Recorded";
					},
					error: (err: { message?: string }) =>
						err?.message ?? "Failed to record",
				},
			);
		},
	});

	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const from = useStore(form.store, (s) => s.values.from);
	const to = useStore(form.store, (s) => s.values.to);
	const amountStr = useStore(form.store, (s) => s.values.amount);
	const effect = cashEffect(from, to, Number(amountStr) || 0);

	return (
		<ContentCard className={className}>
			<ContentCardSection className="space-y-3">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<BanknoteIcon className="size-4 text-muted-foreground" />
					Give money
				</div>
				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Form via oRPC mutation; preventDefault is the documented pattern */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					className="grid gap-4 sm:grid-cols-2"
				>
					{/* Inputs */}
					<div className="space-y-2.5">
						<form.Field name="from">
							{(field) => (
								<LabeledSelect
									label="Take from"
									value={field.state.value}
									onChange={(v) =>
										field.handleChange(v as CashFrom)
									}
									options={FROM_OPTIONS}
								/>
							)}
						</form.Field>
						<form.Field name="to">
							{(field) => (
								<LabeledSelect
									label="Goes to"
									value={field.state.value}
									onChange={(v) =>
										field.handleChange(v as CashTo)
									}
									options={TO_OPTIONS}
								/>
							)}
						</form.Field>
						<div className="flex gap-2">
							<form.Field name="amount">
								{(field) => (
									<Input
										type="number"
										step="0.01"
										min="0.01"
										placeholder="0.00"
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										className="h-9 w-28 shrink-0 tabular-nums"
										required
									/>
								)}
							</form.Field>
							<form.Field name="notes">
								{(field) => (
									<Input
										value={field.state.value}
										onChange={(e) =>
											field.handleChange(e.target.value)
										}
										placeholder="For… (e.g. pay, buy a router)"
										className="h-9 flex-1"
									/>
								)}
							</form.Field>
						</div>
						<Button
							type="submit"
							variant="secondary"
							className="w-full"
							disabled={isSubmitting || effect.invalid}
						>
							<BanknoteIcon className="mr-1.5 size-4" />
							{isSubmitting ? "Recording…" : "Give money"}
						</Button>
					</div>

					{/* Live preview */}
					<GiveMoneyPreview
						balance={balance}
						amount={Number(amountStr) || 0}
						effect={effect}
					/>
				</form>
			</ContentCardSection>
		</ContentCard>
	);
}

function LabeledSelect<T extends string>({
	label,
	value,
	onChange,
	options,
}: {
	label: string;
	value: T;
	onChange: (value: string) => void;
	options: { value: T; label: string }[];
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className="h-9">
				<span className="mr-1 shrink-0 text-xs text-muted-foreground">
					{label}
				</span>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function GiveMoneyPreview({
	balance,
	amount,
	effect,
}: {
	balance: number;
	amount: number;
	effect: { invalid: boolean; inHandDelta: number; isExpense: boolean };
}) {
	const hasAmount = amount > 0;
	const newInHand = balance + effect.inHandDelta;
	const movesInHand = effect.inHandDelta !== 0;

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-surface-subtle/40 p-3">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				What happens
			</div>

			{effect.invalid ? (
				<p className="text-xs text-warning">
					That's already his cash in hand — pick a different source or
					destination.
				</p>
			) : (
				<>
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">
							His cash in hand
						</div>
						<div className="flex items-center gap-2 text-sm font-medium tabular-nums">
							<span className="text-muted-foreground">
								{formatCurrency(balance)}
							</span>
							<span className="text-muted-foreground/50">→</span>
							<span
								className={cn(
									movesInHand && hasAmount
										? "text-foreground"
										: "text-muted-foreground",
								)}
							>
								{formatCurrency(newInHand)}
							</span>
							{movesInHand && hasAmount ? (
								<span className="text-[11px] font-normal text-muted-foreground">
									{effect.inHandDelta > 0 ? "+" : "−"}
									{formatCurrency(
										Math.abs(effect.inHandDelta),
									)}
								</span>
							) : (
								<span className="text-[11px] font-normal text-muted-foreground">
									no change
								</span>
							)}
						</div>
					</div>

					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">
							Company books
						</div>
						<div className="text-sm font-medium tabular-nums">
							{!hasAmount ? (
								<span className="text-sm font-normal text-muted-foreground">
									—
								</span>
							) : effect.isExpense ? (
								<>
									+{formatCurrency(amount)}{" "}
									<span className="text-[11px] font-normal text-muted-foreground">
										expense
									</span>
								</>
							) : (
								<span className="text-[11px] font-normal text-muted-foreground">
									not an expense (he owes it back)
								</span>
							)}
						</div>
					</div>

					{!hasAmount && (
						<p className="mt-auto text-[11px] text-muted-foreground/70">
							Enter an amount to preview the effect.
						</p>
					)}
				</>
			)}
		</div>
	);
}
