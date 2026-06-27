"use client";

import { EXPENSE_CATEGORIES } from "@saas/expenses";
import {
	useCreateExpense,
	useCreateReceiptUploadUrl,
} from "@saas/expenses/client";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { Textarea } from "@ui/components/textarea";
import { PlusIcon, ReceiptIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMyExpensesQuery } from "../hooks/use-worker";
import { PhotoCaptureInput } from "./PhotoCaptureInput";

const STATUS_VARIANTS: Record<string, "info" | "success" | "error"> = {
	PENDING: "info",
	APPROVED: "success",
	REJECTED: "error",
};

export function WorkerExpenses() {
	const organizationId = useOrganizationId();
	const { expenses, isLoading } = useMyExpensesQuery();
	const createExpense = useCreateExpense();
	const createUploadUrl = useCreateReceiptUploadUrl();

	const [showSubmit, setShowSubmit] = useState(false);
	const [amount, setAmount] = useState("");
	const [category, setCategory] = useState("toolkit");
	const [note, setNote] = useState("");
	const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

	async function handleSubmit() {
		if (!organizationId || !amount || Number(amount) <= 0) {
			return;
		}
		if (category === "other" && !note.trim()) {
			toast.error("A note is required for 'Other' expenses");
			return;
		}
		try {
			await createExpense.mutateAsync({
				organizationId,
				amount: Number(amount),
				description:
					note.trim() ||
					(EXPENSE_CATEGORIES.find((c) => c.value === category)
						?.label ??
						category),
				category,
				receiptUrl: receiptUrl ?? undefined,
			});
			toast.success("Expense submitted for approval");
			setShowSubmit(false);
			setAmount("");
			setNote("");
			setReceiptUrl(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<div className="space-y-3">
			<Button className="w-full" onClick={() => setShowSubmit(true)}>
				<PlusIcon className="mr-2 size-4" />
				Submit expense
			</Button>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton
							key={`exp-skel-${i}`}
							className="h-16 rounded-lg"
						/>
					))}
				</div>
			) : expenses.length === 0 ? (
				<div className="py-16 text-center">
					<ReceiptIcon className="mx-auto size-10 text-muted-foreground/50" />
					<p className="mt-3 text-sm text-muted-foreground">
						No expenses yet.
					</p>
				</div>
			) : (
				expenses.map((expense) => (
					<Card key={expense.id}>
						<CardContent className="flex items-center justify-between gap-3 p-4">
							<div className="min-w-0 flex-1">
								<p className="font-mono text-sm font-medium tabular-nums">
									{formatCurrency(expense.amount)}
								</p>
								<p className="line-clamp-1 text-xs text-muted-foreground">
									{expense.description}
								</p>
								<p className="text-xs text-muted-foreground">
									{formatDate(expense.createdAt, {
										dateStyle: "medium",
									})}
								</p>
								{expense.status === "REJECTED" &&
									expense.rejectedReason && (
										<p className="text-xs text-destructive">
											{expense.rejectedReason}
										</p>
									)}
							</div>
							<Badge
								variant={
									STATUS_VARIANTS[expense.status] ?? "info"
								}
							>
								{expense.status.toLowerCase()}
							</Badge>
						</CardContent>
					</Card>
				))
			)}

			<Sheet open={showSubmit} onOpenChange={setShowSubmit}>
				<SheetContent
					side="bottom"
					className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0"
				>
					<SheetHeader className="border-b px-4 py-3">
						<SheetTitle>Submit Expense</SheetTitle>
					</SheetHeader>
					<div className="flex-1 space-y-4 px-4 py-4">
						<div className="space-y-1.5">
							<Label htmlFor="expense-amount">Amount ($) *</Label>
							<Input
								id="expense-amount"
								type="number"
								inputMode="decimal"
								min={0}
								step="0.01"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0.00"
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Category</Label>
							<Combobox
								value={category}
								onChange={setCategory}
								searchPlaceholder="Search categories…"
								options={EXPENSE_CATEGORIES.map((cat) => ({
									value: cat.value,
									label: cat.label,
								}))}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="expense-note">
								Note{category === "other" ? " *" : ""}
							</Label>
							<Textarea
								id="expense-note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								rows={2}
								placeholder="What was this for?"
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Receipt photo</Label>
							<PhotoCaptureInput
								value={receiptUrl}
								onChange={setReceiptUrl}
								label="Snap the receipt"
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
					</div>
					<SheetFooter className="border-t px-4 py-3">
						<Button
							className="w-full"
							onClick={handleSubmit}
							disabled={
								createExpense.isPending ||
								!amount ||
								Number(amount) <= 0
							}
						>
							{createExpense.isPending
								? "Submitting…"
								: "Submit for approval"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	);
}
