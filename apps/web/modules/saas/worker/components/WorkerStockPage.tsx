"use client";

import { formatCurrency } from "@shared/lib/format";
import { Card, CardContent } from "@ui/components/card";
import { Skeleton } from "@ui/components/skeleton";
import { BoxesIcon } from "lucide-react";
import { useState } from "react";
import { useMyStatsQuery, useMyStockQuery } from "../hooks/use-worker";
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

export function WorkerStockPage() {
	const { allocations, totalValue, isLoading } = useMyStockQuery();
	const { stats, isLoading: statsLoading } = useMyStatsQuery();

	const [search, setSearch] = useState("");
	const [stockFilter, setStockFilter] = useState("all");
	const [sort, setSort] = useState("name");
	const [page, setPage] = useState(1);

	function onFilter<T>(setter: (value: T) => void) {
		return (value: T) => {
			setter(value);
			setPage(1);
		};
	}

	const query = search.trim().toLowerCase();
	const filtered = allocations
		.filter((a) => a.stockItem.name.toLowerCase().includes(query))
		.filter((a) =>
			stockFilter === "in"
				? a.quantity > 0
				: stockFilter === "out"
					? a.quantity <= 0
					: true,
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
						<Card key={alloc.id}>
							<CardContent className="flex items-center justify-between p-4">
								<div className="min-w-0">
									<p className="truncate font-medium text-sm">
										{alloc.stockItem.name}
									</p>
									<p className="text-muted-foreground text-xs">
										{formatCurrency(alloc.unitPrice)} each ·{" "}
										{formatCurrency(
											alloc.quantity * alloc.unitPrice,
										)}{" "}
										total
									</p>
								</div>
								<span className="rounded-md bg-muted px-2.5 py-1 font-medium font-mono text-sm tabular-nums">
									× {alloc.quantity}
								</span>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<Pager page={page} totalPages={totalPages} onPageChange={setPage} />
		</div>
	);
}
