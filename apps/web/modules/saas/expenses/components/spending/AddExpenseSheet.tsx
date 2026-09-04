"use client";

import { PhotoCaptureInput } from "@saas/worker/client";
import { formatCurrency, formatDateInput } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Textarea } from "@ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { useCreateReceiptUploadUrl } from "../../hooks/use-expenses";
import {
	useFinanceCategories,
	useRecordExpense,
} from "../../hooks/use-spending";

interface AddExpenseSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Pre-pick a bucket (from a bucket page). */
	bucketId?: string | null;
}

const QUICK_AMOUNTS = [20, 50, 100, 500, 1000];

export function parseMoney(value: string): number {
	const n = Number.parseFloat(value.replace(/,/g, ""));
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * An owner records money that went out — rent, a licence, the maintenance
 * fee. It is saved approved and lands straight in its bucket; nobody's cash
 * balance moves, because nobody is being paid back.
 */
export function AddExpenseSheet({
	open,
	onOpenChange,
	bucketId,
}: AddExpenseSheetProps) {
	const organizationId = useOrganizationId();
	const { categories, isLoading } = useFinanceCategories();
	const record = useRecordExpense();
	const createUploadUrl = useCreateReceiptUploadUrl();

	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [financeCategoryId, setFinanceCategoryId] = useState(bucketId ?? "");
	const [date, setDate] = useState(formatDateInput());
	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

	const parsed = parseMoney(amount);
	const bucket = categories.find((c) => c.id === financeCategoryId);
	const canSubmit =
		!!organizationId &&
		parsed > 0 &&
		description.trim().length > 0 &&
		!record.isPending;

	async function submit() {
		if (!organizationId || !canSubmit) {
			return;
		}
		try {
			const result = await record.mutateAsync({
				organizationId,
				amount: parsed,
				description: description.trim(),
				...(financeCategoryId ? { financeCategoryId } : {}),
				...(date ? { date: new Date(`${date}T12:00:00Z`) } : {}),
				...(receiptUrl ? { receiptUrl } : {}),
			});
			toast.success(
				`${formatCurrency(parsed)} recorded under ${result.expense.financeCategory?.label ?? "Needs a bucket"}.`,
			);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not record it",
			);
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
				<SheetHeader className="border-b px-4 py-3 text-left">
					<SheetTitle>Add an expense</SheetTitle>
					<SheetDescription>
						Money the business paid out. It goes on the books as
						approved — no worker, no reimbursement.
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
					<div className="space-y-1.5">
						<Label htmlFor="add-expense-amount">Amount</Label>
						<Input
							id="add-expense-amount"
							inputMode="decimal"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							placeholder="0.00"
							className="font-mono tabular-nums"
							autoFocus
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
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="add-expense-what">
							What was it for?
						</Label>
						<Textarea
							id="add-expense-what"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							placeholder="e.g. Office rent September, App maintenance — Abiroot"
						/>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="add-expense-bucket">Bucket</Label>
						<Combobox
							id="add-expense-bucket"
							value={financeCategoryId}
							onChange={setFinanceCategoryId}
							options={[
								{
									value: "",
									label: "Let the money map decide",
								},
								...categories.map((c) => ({
									value: c.id,
									label: c.label,
								})),
							]}
							placeholder={
								isLoading ? "Loading buckets…" : "Pick a bucket"
							}
							searchPlaceholder="Search buckets…"
							emptyText="No bucket matches"
						/>
						<p className="text-xs text-muted-foreground">
							{bucket?.hint ??
								"Without a pick it is filed by your money-map rules, or lands in Needs a bucket."}
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="add-expense-date">When</Label>
						<Input
							id="add-expense-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</div>

					<div className="space-y-1.5">
						<Label>Receipt (optional)</Label>
						<PhotoCaptureInput
							value={receiptUrl}
							onChange={setReceiptUrl}
							label="Attach a photo"
							getUploadUrl={async (file) => {
								if (!organizationId) {
									throw new Error("No organization");
								}
								const result =
									await createUploadUrl.mutateAsync({
										organizationId,
										filename: file.name,
										contentType: file.type,
									});
								return {
									uploadUrl: result.uploadUrl,
									publicUrl: result.publicUrl,
								};
							}}
						/>
					</div>

					{parsed > 0 && (
						<div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
							<span className="font-medium">
								{formatCurrency(parsed)}
							</span>{" "}
							goes into{" "}
							<span className="font-medium">
								{bucket?.label ?? "the bucket your rules pick"}
							</span>{" "}
							as approved, dated {date || "today"}.
						</div>
					)}
				</div>

				<SheetFooter className="border-t px-4 py-3">
					<Button
						className="w-full"
						onClick={submit}
						disabled={!canSubmit}
					>
						{record.isPending
							? "Saving…"
							: `Record ${parsed > 0 ? formatCurrency(parsed) : "expense"}`}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
