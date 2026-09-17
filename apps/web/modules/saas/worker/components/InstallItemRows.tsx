"use client";

import { bilingual } from "@repo/utils";
import { useAddonDefaultsQuery } from "@saas/installations/client";
import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useMyStockQuery } from "../hooks/use-worker";
import { FIELD_LABELS as L } from "../lib/labels";
import { type InstallLine, installLinesTotal } from "./install-lines";

/**
 * Per stock item: what the worker holds, what is already committed on his
 * pending installs / refund requests, and what he can still use. Same rule
 * the server's stock guard applies at submission.
 */
export function useMyAvailableStock() {
	const { allocations, pendingInstallByItem, pendingRefundByItem } =
		useMyStockQuery();
	return new Map(
		allocations.map((a) => {
			const pending =
				(pendingInstallByItem[a.stockItem.id] ?? 0) +
				(pendingRefundByItem[a.stockItem.id] ?? 0);
			return [
				a.stockItem.id,
				{
					held: a.quantity,
					pending,
					available: Math.max(0, a.quantity - pending),
				},
			] as const;
		}),
	);
}

/**
 * Which item lines ask for more than the worker can still use. The server
 * refuses these at submission; surfacing them here keeps the worker from
 * hitting that wall after filling the whole form.
 */
export function useOverStockLines(lines: InstallLine[]): Set<number> {
	const stock = useMyAvailableStock();
	const needed = new Map<string, number>();
	for (const line of lines) {
		if (line.kind === "item" && line.stockItemId) {
			needed.set(
				line.stockItemId,
				(needed.get(line.stockItemId) ?? 0) + line.quantity,
			);
		}
	}
	const over = new Set<number>();
	for (const line of lines) {
		if (
			line.kind === "item" &&
			line.stockItemId &&
			(needed.get(line.stockItemId) ?? 0) >
				(stock.get(line.stockItemId)?.available ?? 0)
		) {
			over.add(line.key);
		}
	}
	return over;
}

/**
 * Multi-row builder for installation lines: stock items from the worker's
 * own inventory plus add-ons (max one IPTV + one Real IP). Shared between
 * the Install page and the new-customer wizard.
 */
export function InstallItemRows({
	lines,
	onChange,
	allowAddons = true,
}: {
	lines: InstallLine[];
	onChange: (lines: InstallLine[]) => void;
	allowAddons?: boolean;
}) {
	const { allocations } = useMyStockQuery();
	const stock = useMyAvailableStock();
	const addonDefaults = useAddonDefaultsQuery();
	const overStock = useOverStockLines(lines);

	const hasIptv = lines.some((l) => l.addonType === "IPTV");
	const hasRealIp = lines.some((l) => l.addonType === "REAL_IP");

	function defaultAddonPrice(type: "IPTV" | "REAL_IP"): number {
		return type === "IPTV"
			? addonDefaults.iptvPrice
			: addonDefaults.realIpPrice;
	}

	function update(key: number, patch: Partial<InstallLine>) {
		onChange(
			lines.map((line) =>
				line.key === key ? { ...line, ...patch } : line,
			),
		);
	}

	function addLine(kind: "item" | "addon") {
		const key = Math.max(0, ...lines.map((l) => l.key)) + 1;
		const addonType =
			kind === "addon" ? (hasIptv ? "REAL_IP" : "IPTV") : null;
		onChange([
			...lines,
			{
				key,
				kind,
				stockItemId: null,
				addonType,
				quantity: 1,
				price: addonType ? defaultAddonPrice(addonType) : 0,
			},
		]);
	}

	return (
		<div className="space-y-3">
			{lines.map((line) => (
				<div key={line.key} className="space-y-2 rounded-md border p-3">
					<div className="flex items-center justify-between">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{line.kind === "addon" ? L.addon : L.item}
						</p>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							onClick={() =>
								onChange(
									lines.filter((l) => l.key !== line.key),
								)
							}
							aria-label="Remove line"
						>
							<Trash2Icon className="size-4" />
						</Button>
					</div>

					{line.kind === "item" ? (
						<Combobox
							value={line.stockItemId ?? ""}
							placeholder={L.pickFromMyStock}
							searchPlaceholder={L.searchMyStock}
							emptyText={L.noStockItems}
							onChange={(v) => {
								const alloc = allocations.find(
									(a) => a.stockItem.id === v,
								);
								update(line.key, {
									stockItemId: v,
									price:
										alloc?.stockItem.sellPrice ??
										alloc?.unitPrice ??
										0,
								});
							}}
							options={allocations.map((alloc) => ({
								value: alloc.stockItem.id,
								label: stockLabel(
									alloc.stockItem.name,
									stock.get(alloc.stockItem.id),
								),
							}))}
						/>
					) : (
						<Combobox
							value={line.addonType ?? ""}
							placeholder={L.addonType}
							searchPlaceholder={L.search}
							onChange={(v) => {
								const addonType = v as "IPTV" | "REAL_IP";
								update(line.key, {
									addonType,
									price: defaultAddonPrice(addonType),
								});
							}}
							options={[
								{
									value: "IPTV",
									label: "IPTV",
									disabled:
										hasIptv && line.addonType !== "IPTV",
								},
								{
									value: "REAL_IP",
									label: "Real IP",
									disabled:
										hasRealIp &&
										line.addonType !== "REAL_IP",
								},
							]}
						/>
					)}

					<div className="grid grid-cols-2 gap-2">
						{line.kind === "item" && (
							<div className="space-y-1">
								<Label className="text-xs">{L.qty}</Label>
								<Input
									type="number"
									inputMode="numeric"
									min={1}
									max={
										line.stockItemId
											? stock.get(line.stockItemId)
													?.available
											: undefined
									}
									value={line.quantity}
									aria-invalid={
										overStock.has(line.key) || undefined
									}
									onChange={(e) =>
										update(line.key, {
											quantity: Number(e.target.value),
										})
									}
								/>
								{overStock.has(line.key) && (
									<p className="text-xs text-destructive">
										{overStockHint(
											line.stockItemId
												? stock.get(line.stockItemId)
												: undefined,
										)}
									</p>
								)}
							</div>
						)}
						<div className="space-y-1">
							<Label className="text-xs">
								{line.kind === "addon"
									? L.monthlyPrice
									: L.price}
							</Label>
							{line.kind === "item" ? (
								// Hardware prices are admin-set on the stock item;
								// the server enforces this for worker submissions.
								<Input
									type="number"
									value={line.price}
									disabled
									readOnly
								/>
							) : (
								<Input
									type="number"
									inputMode="decimal"
									min={0}
									step="0.01"
									value={line.price}
									onChange={(e) =>
										update(line.key, {
											price: Number(e.target.value),
										})
									}
								/>
							)}
						</div>
					</div>
				</div>
			))}

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-auto min-h-8 flex-1 whitespace-normal py-1.5"
					onClick={() => addLine("item")}
				>
					<PlusIcon className="mr-1.5 size-3.5" />
					{L.addItem}
				</Button>
				{allowAddons && (
					<Button
						variant="outline"
						size="sm"
						className="h-auto min-h-8 flex-1 whitespace-normal py-1.5"
						disabled={hasIptv && hasRealIp}
						onClick={() => addLine("addon")}
					>
						<PlusIcon className="mr-1.5 size-3.5" />
						{L.addAddon}
					</Button>
				)}
			</div>

			{lines.length > 0 && (
				<div className="flex items-center justify-between border-t pt-2 text-sm">
					<span className="text-muted-foreground">{L.total}</span>
					<span className="font-mono font-medium tabular-nums">
						{formatCurrency(installLinesTotal(lines))}
					</span>
				</div>
			)}
		</div>
	);
}

function stockLabel(
	name: string,
	stock: { held: number; pending: number } | undefined,
): string {
	if (!stock) {
		return name;
	}
	return stock.pending > 0
		? `${name} (${bilingual(
				`have ${stock.held}, ${stock.pending} pending`,
				`معك ${stock.held}، ${stock.pending} معلّقة`,
			)})`
		: `${name} (${bilingual(`have ${stock.held}`, `معك ${stock.held}`)})`;
}

function overStockHint(
	stock: { held: number; pending: number; available: number } | undefined,
): string {
	const held = stock?.held ?? 0;
	if (stock && stock.pending > 0) {
		return bilingual(
			`You hold ${held} (${stock.pending} already pending), so you can use ${stock.available} — lower the quantity or ask for a delivery.`,
			`معك ${held} (${stock.pending} منها معلّقة)، يمكنك استعمال ${stock.available} — خفّف الكمية أو اطلب تسليم.`,
		);
	}
	return bilingual(
		`You hold ${held} — lower the quantity or ask for a delivery.`,
		`معك ${held} — خفّف الكمية أو اطلب تسليم.`,
	);
}
