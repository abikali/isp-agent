"use client";

import { useConfirmationAlert } from "@saas/shared/client";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAdjustDealerCredit } from "../../hooks/use-dealer-finance";

export interface CreditTarget {
	id: string;
	name: string;
	owed: number;
	prepaid: number;
}

interface AdjustCreditSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	dealer: CreditTarget | null;
	dealers?: CreditTarget[];
	initialDirection?: "add" | "deduct";
}

const QUICK_AMOUNTS = [100, 500, 1000, 2000];

function parseAmount(value: string): number {
	const n = Number.parseFloat(value.replace(/,/g, ""));
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Give a dealer prepaid credit (or take it back). Both numbers move at once —
 * their spendable credit AND what they owe — and the sheet shows both before
 * anything is written. Mount with `key={dealer?.id}`.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- one form, one submit path; the preview and the confirm need the same state
export function AdjustCreditSheet({
	open,
	onOpenChange,
	dealer,
	dealers = [],
	initialDirection = "add",
}: AdjustCreditSheetProps) {
	const organizationId = useOrganizationId();
	const adjust = useAdjustDealerCredit();
	const { confirm } = useConfirmationAlert();

	const [dealerId, setDealerId] = useState(dealer?.id ?? "");
	const [direction, setDirection] = useState<"add" | "deduct">(
		initialDirection,
	);
	const [amount, setAmount] = useState("");
	const [note, setNote] = useState("");

	const target = dealer ?? dealers.find((d) => d.id === dealerId) ?? null;
	const parsed = parseAmount(amount);
	const delta = direction === "add" ? parsed : -parsed;
	const prepaidAfter = target
		? Math.round((target.prepaid + delta) * 100) / 100
		: 0;
	const owedAfter = target
		? Math.round((target.owed + delta) * 100) / 100
		: 0;
	const tooMuchToDeduct =
		direction === "deduct" && !!target && parsed > target.prepaid + 1e-6;

	const canSubmit =
		!!organizationId &&
		!!target &&
		parsed > 0 &&
		!tooMuchToDeduct &&
		!adjust.isPending;

	function submit() {
		if (!organizationId || !target) {
			return;
		}
		confirm({
			title:
				direction === "add"
					? `Give ${target.name} ${formatCurrency(parsed)} of credit?`
					: `Take ${formatCurrency(parsed)} of credit back from ${target.name}?`,
			message:
				direction === "add"
					? `Their credit becomes ${formatCurrency(prepaidAfter)} and they will owe you ${formatCurrency(owedAfter)}. This is written to iRadius immediately.`
					: `Their credit drops to ${formatCurrency(prepaidAfter)} and what they owe you drops to ${formatCurrency(owedAfter)}. This is written to iRadius immediately.`,
			confirmLabel: direction === "add" ? "Add credit" : "Deduct credit",
			destructive: direction === "deduct",
			onConfirm: async () => {
				try {
					const result = await adjust.mutateAsync({
						organizationId,
						dealerId: target.id,
						direction,
						amount: parsed,
						...(note.trim() ? { note: note.trim() } : {}),
					});
					toast.success(
						`${target.name} now has ${formatCurrency(result.prepaid)} credit and owes ${formatCurrency(result.owed)}.`,
					);
					onOpenChange(false);
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Could not change the credit",
					);
				}
			},
		});
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
				<SheetHeader className="border-b border-border pb-4">
					<SheetTitle>
						{direction === "add" ? "Add credit" : "Deduct credit"}
					</SheetTitle>
					<SheetDescription>
						Credit is what a dealer spends on renewals. Giving it
						raises what they owe you; taking it back lowers it.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-5 py-5">
					{!dealer && (
						<div className="space-y-1.5">
							<Label htmlFor="credit-dealer">Dealer</Label>
							<Select
								value={dealerId}
								onValueChange={setDealerId}
							>
								<SelectTrigger id="credit-dealer">
									<SelectValue placeholder="Choose a dealer" />
								</SelectTrigger>
								<SelectContent>
									{[...dealers]
										.sort((a, b) =>
											a.name.localeCompare(b.name),
										)
										.map((d) => (
											<SelectItem key={d.id} value={d.id}>
												{d.name} —{" "}
												{formatCurrency(d.prepaid)} left
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="grid grid-cols-2 gap-2">
						{(
							[
								{
									value: "add",
									label: "Add credit",
									hint: "They get more to spend",
								},
								{
									value: "deduct",
									label: "Deduct",
									hint: "Take credit back",
								},
							] as const
						).map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => setDirection(option.value)}
								aria-pressed={direction === option.value}
								className={cn(
									"rounded-lg border px-3 py-2 text-left transition-colors",
									direction === option.value
										? "border-foreground/50 bg-background ring-1 ring-foreground/10"
										: "border-border hover:border-foreground/20",
								)}
							>
								<div className="text-sm font-medium">
									{option.label}
								</div>
								<div className="text-xs text-muted-foreground">
									{option.hint}
								</div>
							</button>
						))}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="credit-amount">Amount</Label>
						<Input
							id="credit-amount"
							inputMode="decimal"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							placeholder="0.00"
							className="font-mono tabular-nums"
							autoFocus={!!dealer}
						/>
						<div className="flex flex-wrap gap-1.5">
							{QUICK_AMOUNTS.map((q) => (
								<Button
									key={q}
									type="button"
									size="sm"
									variant="outline"
									onClick={() => setAmount(String(q))}
								>
									{formatCurrency(q)}
								</Button>
							))}
						</div>
						{tooMuchToDeduct && target && (
							<p className="text-xs text-destructive">
								They only have {formatCurrency(target.prepaid)}{" "}
								of credit left.
							</p>
						)}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="credit-note">
							Note{" "}
							<span className="font-normal text-muted-foreground">
								(shows in iRadius too)
							</span>
						</Label>
						<Textarea
							id="credit-note"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							rows={2}
							maxLength={200}
							placeholder="e.g. Month 9 bandwidth"
						/>
					</div>

					{target && parsed > 0 && !tooMuchToDeduct && (
						<div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
							<Preview
								label="Credit to spend"
								before={target.prepaid}
								after={prepaidAfter}
							/>
							<Preview
								label={`${target.name} owes you`}
								before={target.owed}
								after={owedAfter}
							/>
						</div>
					)}
				</div>

				<div className="flex gap-2 border-t border-border pt-4">
					<Button
						variant="outline"
						className="flex-1"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						className="flex-1"
						variant={
							direction === "deduct" ? "destructive" : "primary"
						}
						disabled={!canSubmit}
						onClick={submit}
					>
						{adjust.isPending
							? "Saving…"
							: direction === "add"
								? "Add credit"
								: "Deduct credit"}
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function Preview({
	label,
	before,
	after,
}: {
	label: string;
	before: number;
	after: number;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className="flex items-center gap-1.5 font-mono tabular-nums">
				<span className="text-muted-foreground">
					{formatCurrency(before)}
				</span>
				<ArrowRightIcon className="size-3.5 text-muted-foreground" />
				<span className="font-medium">{formatCurrency(after)}</span>
			</span>
		</div>
	);
}
