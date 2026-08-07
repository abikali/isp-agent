"use client";

import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
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
import { BoxesIcon, UndoIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useMyStatsQuery,
	useMyStockQuery,
	useRequestStockRefund,
} from "../hooks/use-worker";
import { Pager, SearchBar, SelectControl, StatStrip } from "./WorkerUI";

const PAGE_SIZE = 15;

const STOCK_FILTERS = [
	{ value: "all", label: "All items" },
	{ value: "in", label: "In stock" },
	{ value: "out", label: "Out of stock" },
];
const SORT_OPTIONS = [
	{ value: "name", label: "Name A–Z" },
	{ value: "qty", label: "Quantity" },
	{ value: "value", label: "Value" },
];

type Allocation = ReturnType<typeof useMyStockQuery>["allocations"][number];

export function WorkerStockPage() {
	const { allocations, totalValue, pendingRefundByItem, isLoading } =
		useMyStockQuery();
	const { stats, isLoading: statsLoading } = useMyStatsQuery();

	const [search, setSearch] = useState("");
	const [stockFilter, setStockFilter] = useState("all");
	const [sort, setSort] = useState("name");
	const [page, setPage] = useState(1);
	const [refundAlloc, setRefundAlloc] = useState<Allocation | null>(null);

	function onFilter<T>(setter: (value: T) => void) {
		return (value: T) => {
			setter(value);
			setPage(1);
		};
	}

	const query = search.trim().toLowerCase();
	const filtered = allocations
		.filter(
			(a) =>
				a.stockItem.name.toLowerCase().includes(query) &&
				(stockFilter === "in"
					? a.quantity > 0
					: stockFilter === "out"
						? a.quantity <= 0
						: true),
		)
		.sort((a, b) => {
			if (sort === "qty") {
				return b.quantity - a.quantity;
			}
			if (sort === "value") {
				return b.quantity * b.unitPrice - a.quantity * a.unitPrice;
			}
			return a.stockItem.name.localeCompare(b.stockItem.name);
		});

	const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
	const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

	const totalUnits = allocations.reduce((sum, a) => sum + a.quantity, 0);
	const statItems = [
		{ label: "Items", value: String(allocations.length) },
		{ label: "Units", value: String(totalUnits) },
		{ label: "Value", value: formatCurrency(totalValue) },
		{
			label: "Received (mo)",
			value: String(stats?.stock.receivedThisMonth ?? 0),
		},
	];

	return (
		<div className="space-y-3">
			<StatStrip
				items={statItems}
				isLoading={isLoading || statsLoading}
			/>

			<SearchBar
				value={search}
				onChange={onFilter(setSearch)}
				placeholder="Search my stock…"
			/>
			<div className="flex flex-wrap items-center gap-2">
				<SelectControl
					ariaLabel="Filter stock"
					value={stockFilter}
					onChange={onFilter(setStockFilter)}
					options={STOCK_FILTERS}
				/>
				<SelectControl
					ariaLabel="Sort stock"
					value={sort}
					onChange={onFilter(setSort)}
					options={SORT_OPTIONS}
					className="ml-auto"
				/>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton
							key={`stock-skel-${i}`}
							className="h-16 rounded-lg"
						/>
					))}
				</div>
			) : pageItems.length === 0 ? (
				<div className="py-16 text-center">
					<BoxesIcon className="mx-auto size-10 text-muted-foreground/50" />
					<p className="mt-3 text-sm text-muted-foreground">
						{allocations.length === 0
							? "You don't hold any stock right now."
							: "No items match your filters."}
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{pageItems.map((alloc) => (
						<StockCard
							key={alloc.id}
							alloc={alloc}
							pendingRefund={
								pendingRefundByItem[alloc.stockItem.id] ?? 0
							}
							onRefund={() => setRefundAlloc(alloc)}
						/>
					))}
				</div>
			)}

			<Pager page={page} totalPages={totalPages} onPageChange={setPage} />

			<RefundSheet
				alloc={refundAlloc}
				pendingRefund={
					refundAlloc
						? (pendingRefundByItem[refundAlloc.stockItem.id] ?? 0)
						: 0
				}
				onClose={() => setRefundAlloc(null)}
			/>
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- stock row colocated with its list
function StockCard({
	alloc,
	pendingRefund,
	onRefund,
}: {
	alloc: Allocation;
	pendingRefund: number;
	onRefund: () => void;
}) {
	const refundable = alloc.quantity - pendingRefund;
	return (
		<Card>
			<CardContent className="space-y-3 p-4">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">
							{alloc.stockItem.name}
						</p>
						<p className="text-muted-foreground text-xs">
							{formatCurrency(alloc.unitPrice)} each ·{" "}
							{formatCurrency(alloc.quantity * alloc.unitPrice)}{" "}
							total
						</p>
					</div>
					<span className="rounded-md bg-muted px-2.5 py-1 font-medium font-mono text-sm tabular-nums">
						× {alloc.quantity}
					</span>
				</div>
				<div className="flex items-center justify-between gap-2">
					{pendingRefund > 0 ? (
						<Badge variant="info">
							{pendingRefund} pending refund
						</Badge>
					) : (
						<span />
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={onRefund}
						disabled={refundable <= 0}
					>
						<UndoIcon className="mr-1.5 size-3.5" />
						Ask for refund
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- refund form colocated with the stock list it serves
function RefundSheet({
	alloc,
	pendingRefund,
	onClose,
}: {
	alloc: Allocation | null;
	pendingRefund: number;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const requestRefund = useRequestStockRefund();
	const refundable = alloc ? alloc.quantity - pendingRefund : 0;

	const [quantity, setQuantity] = useState("");
	const [note, setNote] = useState("");
	// Track which allocation the form is initialised for so opening a new card
	// resets the quantity to "all" (the default) without an effect.
	const [initialisedFor, setInitialisedFor] = useState<string | null>(null);
	if (alloc && initialisedFor !== alloc.id) {
		setInitialisedFor(alloc.id);
		setQuantity(String(refundable));
		setNote("");
	}

	const qty = Number(quantity);
	const valid = qty >= 1 && qty <= refundable && Number.isInteger(qty);

	async function handleSubmit() {
		if (!organizationId || !alloc || !valid) {
			return;
		}
		try {
			await requestRefund.mutateAsync({
				organizationId,
				stockItemId: alloc.stockItem.id,
				quantity: qty,
				...(note.trim() ? { notes: note.trim() } : {}),
			});
			toast.success("Refund request sent for approval");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to send refund request",
			);
		}
	}

	return (
		<Sheet
			open={!!alloc}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
		>
			<SheetContent
				side="bottom"
				className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0"
			>
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle>Ask for refund</SheetTitle>
				</SheetHeader>
				{alloc ? (
					<div className="flex-1 space-y-4 px-4 py-4">
						<div className="rounded-lg border p-3">
							<p className="font-medium text-sm">
								{alloc.stockItem.name}
							</p>
							<p className="text-muted-foreground text-xs">
								You hold {alloc.quantity}
								{pendingRefund > 0
									? ` · ${pendingRefund} already pending`
									: ""}{" "}
								· {formatCurrency(alloc.unitPrice)} each
							</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="refund-qty">
								Quantity to refund *
							</Label>
							<Input
								id="refund-qty"
								type="number"
								inputMode="numeric"
								min={1}
								max={refundable}
								step={1}
								value={quantity}
								onChange={(e) => setQuantity(e.target.value)}
							/>
							<p className="text-muted-foreground text-xs">
								Up to {refundable} can be refunded.
							</p>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="refund-note">Note (optional)</Label>
							<Textarea
								id="refund-note"
								value={note}
								onChange={(e) => setNote(e.target.value)}
								rows={2}
								placeholder="Why are you returning this?"
							/>
						</div>
					</div>
				) : null}
				<SheetFooter className="border-t px-4 py-3">
					<Button
						className="w-full"
						onClick={handleSubmit}
						disabled={requestRefund.isPending || !valid}
					>
						{requestRefund.isPending
							? "Sending…"
							: "Send refund request"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
