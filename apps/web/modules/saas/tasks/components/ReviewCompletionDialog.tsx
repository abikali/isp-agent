"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Label } from "@ui/components/label";
import { Skeleton } from "@ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import { AlertTriangleIcon, CheckIcon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useReviewTaskCompletion } from "../hooks/use-tasks";

type ReviewAction = "approve" | "reject";

interface ReviewCompletionDialogProps {
	taskId: string;
	/** Which tab opens first; null keeps the dialog closed. */
	action: ReviewAction | null;
	onClose: () => void;
}

/**
 * Approve or reject a field completion, showing exactly which installed and
 * recovered lines the decision approves or reverts (stock, cash entries,
 * add-on prices) — one step instead of approving the task and then each
 * line on the Installations / Recovered queues.
 */
export function ReviewCompletionDialog({
	taskId,
	action,
	onClose,
}: ReviewCompletionDialogProps) {
	return (
		<Dialog
			open={action !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				{action && (
					<ReviewCompletionBody
						taskId={taskId}
						initialAction={action}
						onDone={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function ReviewCompletionBody({
	taskId,
	initialAction,
	onDone,
}: {
	taskId: string;
	initialAction: ReviewAction;
	onDone: () => void;
}) {
	const organizationId = useOrganizationId();
	const review = useReviewTaskCompletion();
	const [tab, setTab] = useState<ReviewAction>(initialAction);
	const [note, setNote] = useState("");
	const [keepRecovered, setKeepRecovered] = useState(false);
	const { data, isLoading } = useQuery({
		...orpc.tasks.get.queryOptions({
			input: { organizationId: organizationId ?? "", id: taskId },
		}),
		enabled: Boolean(organizationId),
	});
	const task = data?.task;
	const worker = task?.completedByEmployee?.name ?? "the worker";

	async function submit() {
		if (!organizationId) {
			return;
		}
		const result = await review.mutateAsync({
			organizationId,
			taskId,
			action: tab,
			...(tab === "reject" && note.trim() ? { note: note.trim() } : {}),
			...(tab === "reject" && keepRecovered ? { keepRecovered } : {}),
		});
		if (tab === "approve") {
			const { installations, recovered } = result.approved;
			toast.success(
				installations + recovered > 0
					? `Task approved with ${installations} installed and ${recovered} recovered item(s)`
					: "Task completion approved",
			);
		} else {
			toast.success("Completion rejected — task returned to the worker");
			if (result.addonPriceKept.length > 0) {
				toast.warning(
					"Add-on prices set by this task were kept — fix them on the customer page if needed",
				);
			}
		}
		onDone();
	}

	const installs = task?.installations ?? [];
	const recovered = task?.uninstalledItems ?? [];
	const approvedAddons = installs.filter(
		(l) => l.isAddOn && l.status === "APPROVED" && !l.setupRequestId,
	);

	return (
		<>
			<DialogHeader>
				<DialogTitle>Review completion</DialogTitle>
				<DialogDescription>{task?.title ?? "…"}</DialogDescription>
			</DialogHeader>

			<Tabs value={tab} onValueChange={(v) => setTab(v as ReviewAction)}>
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="approve">Approve</TabsTrigger>
					<TabsTrigger value="reject">Reject</TabsTrigger>
				</TabsList>

				<TabsContent value="approve" className="space-y-3 pt-2">
					<p className="text-muted-foreground text-sm">
						Closes the task and approves its pending items.
					</p>
					{isLoading ? (
						<Skeleton className="h-20 w-full" />
					) : installs.length + recovered.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No installed or recovered items on this task.
						</p>
					) : (
						<ul className="space-y-1.5">
							{installs.map((line) => {
								const pending =
									line.status === "PENDING" &&
									!line.setupRequestId;
								const total = line.price * line.quantity;
								return (
									<LineRow
										key={line.id}
										muted={!pending}
										status={
											line.setupRequestId &&
											line.status === "PENDING"
												? "setup request"
												: line.status
										}
										title={
											line.isAddOn
												? `${line.notes ?? "Add-on"} ${formatCurrency(line.price)}/mo`
												: `${line.stockItem?.name ?? "Item"} ×${line.quantity}`
										}
										detail={
											line.isAddOn
												? "Set in iRadius"
												: total > 0
													? `Cash entry ${formatCurrency(total)} to ${line.employee?.name ?? worker}`
													: "Stock only, no cash entry"
										}
									/>
								);
							})}
							{recovered.map((item) => (
								<LineRow
									key={item.id}
									muted={item.status !== "PENDING"}
									status={item.status}
									title={`Recovered: ${item.stockItem?.name ?? item.itemName} ×${item.quantity}`}
									detail={`Added to ${worker}'s stock${
										item.stockItem
											? ` at ${formatCurrency(item.stockItem.sellPrice)}`
											: ""
									}`}
								/>
							))}
						</ul>
					)}
				</TabsContent>

				<TabsContent value="reject" className="space-y-3 pt-2">
					<p className="text-muted-foreground text-sm">
						Returns the task to the worker's queue. Items from this
						submission are reverted; the worker resubmits them.
					</p>
					<div className="space-y-1.5">
						<Label htmlFor="reject-reason">
							Reason (sent to the worker)
						</Label>
						<Textarea
							id="reject-reason"
							value={note}
							onChange={(e) => setNote(e.target.value)}
							maxLength={1000}
							rows={3}
						/>
					</div>
					{installs.length + recovered.length > 0 && (
						<ul className="space-y-1.5">
							{installs.map((line) => (
								<LineRow
									key={line.id}
									muted={
										line.status === "DENIED" ||
										Boolean(line.setupRequestId)
									}
									status={line.status}
									title={
										line.isAddOn
											? `${line.notes ?? "Add-on"} ${formatCurrency(line.price)}/mo`
											: `${line.stockItem?.name ?? "Item"} ×${line.quantity}`
									}
									detail={
										line.setupRequestId
											? "Part of a setup request — untouched"
											: line.status === "PENDING"
												? "Denied"
												: line.status === "APPROVED"
													? line.isAddOn
														? "Denied — price stays on the customer"
														: `Stock back to ${line.employee?.name ?? worker}${
																line.cashEntry
																	? `, cash entry ${formatCurrency(line.cashEntry.amount)} deleted`
																	: ""
															}`
													: "Already denied"
									}
								/>
							))}
							{recovered.map((item) => (
								<LineRow
									key={item.id}
									muted={
										item.status === "DENIED" ||
										(item.status === "APPROVED" &&
											keepRecovered)
									}
									status={item.status}
									title={`Recovered: ${item.stockItem?.name ?? item.itemName} ×${item.quantity}`}
									detail={
										item.status === "PENDING"
											? "Denied"
											: item.status === "APPROVED"
												? keepRecovered
													? `Stays in ${worker}'s stock`
													: `Removed from ${worker}'s stock`
												: "Already denied"
									}
								/>
							))}
						</ul>
					)}
					{recovered.some((i) => i.status === "APPROVED") && (
						<div className="flex items-center gap-2">
							<Checkbox
								id="keep-recovered"
								checked={keepRecovered}
								onCheckedChange={(v) =>
									setKeepRecovered(v === true)
								}
							/>
							<Label
								htmlFor="keep-recovered"
								className="font-normal text-sm"
							>
								Keep approved recovered items in the worker's
								stock
							</Label>
						</div>
					)}
					{approvedAddons.length > 0 && (
						<div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 text-sm dark:text-amber-300">
							<AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
							<span>
								The add-on price already set in iRadius (
								{approvedAddons
									.map(
										(l) =>
											`${l.notes ?? "Add-on"} ${formatCurrency(l.price)}`,
									)
									.join(", ")}
								) is not reset. Fix it on the customer page if
								needed.
							</span>
						</div>
					)}
				</TabsContent>
			</Tabs>

			{review.error && (
				<div
					role="alert"
					className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
				>
					{review.error.message}
				</div>
			)}

			<DialogFooter>
				<Button variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button
					variant={tab === "approve" ? "primary" : "destructive"}
					onClick={() => {
						submit().catch(() => {
							// Shown inline via review.error.
						});
					}}
					disabled={review.isPending || !task}
				>
					{tab === "approve" ? (
						<CheckIcon className="size-4" />
					) : (
						<UndoIcon className="size-4" />
					)}
					{tab === "approve" ? "Approve" : "Reject completion"}
				</Button>
			</DialogFooter>
		</>
	);
}

function LineRow({
	title,
	detail,
	status,
	muted,
}: {
	title: string;
	detail: string;
	status: string;
	muted: boolean;
}) {
	return (
		<li
			className={cn(
				"flex items-start justify-between gap-2 rounded-md border p-2.5 text-sm",
				muted && "opacity-50",
			)}
		>
			<span className="min-w-0">
				<span className="block font-medium">{title}</span>
				<span className="block text-muted-foreground text-xs">
					{detail}
				</span>
			</span>
			<Badge variant="outline" className="shrink-0">
				{status.toLowerCase()}
			</Badge>
		</li>
	);
}
