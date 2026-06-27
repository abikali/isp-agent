"use client";

import { useAddonDefaultsQuery } from "@saas/installations/client";
import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useMyStockQuery } from "../hooks/use-worker";

export interface InstallLine {
	key: number;
	kind: "item" | "addon";
	stockItemId: string | null;
	addonType: "IPTV" | "REAL_IP" | null;
	quantity: number;
	price: number;
}

export function installLinesTotal(lines: InstallLine[]): number {
	return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

export function linesToPayload(lines: InstallLine[]) {
	return lines
		.filter((l) => l.stockItemId || l.addonType)
		.map((l) =>
			l.kind === "item"
				? {
						stockItemId: l.stockItemId as string,
						quantity: l.quantity,
						price: l.price,
					}
				: {
						addonType: l.addonType as "IPTV" | "REAL_IP",
						quantity: 1,
						price: l.price,
					},
		);
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
	const addonDefaults = useAddonDefaultsQuery();

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
							{line.kind === "addon" ? "Add-on" : "Item"}
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
							placeholder="Pick from my stock"
							searchPlaceholder="Search my stock…"
							emptyText="No stock items"
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
								label: `${alloc.stockItem.name} (have ${alloc.quantity})`,
							}))}
						/>
					) : (
						<Combobox
							value={line.addonType ?? ""}
							placeholder="Add-on type"
							searchPlaceholder="Search add-ons…"
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
								<Label className="text-xs">Qty</Label>
								<Input
									type="number"
									inputMode="numeric"
									min={1}
									value={line.quantity}
									onChange={(e) =>
										update(line.key, {
											quantity: Number(e.target.value),
										})
									}
								/>
							</div>
						)}
						<div className="space-y-1">
							<Label className="text-xs">
								{line.kind === "addon"
									? "Monthly price ($)"
									: "Price ($)"}
							</Label>
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
						</div>
					</div>
				</div>
			))}

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="flex-1"
					onClick={() => addLine("item")}
				>
					<PlusIcon className="mr-1.5 size-3.5" />
					Add item
				</Button>
				{allowAddons && (
					<Button
						variant="outline"
						size="sm"
						className="flex-1"
						disabled={hasIptv && hasRealIp}
						onClick={() => addLine("addon")}
					>
						<PlusIcon className="mr-1.5 size-3.5" />
						Add add-on
					</Button>
				)}
			</div>

			{lines.length > 0 && (
				<div className="flex items-center justify-between border-t pt-2 text-sm">
					<span className="text-muted-foreground">Total</span>
					<span className="font-mono font-medium tabular-nums">
						{formatCurrency(installLinesTotal(lines))}
					</span>
				</div>
			)}
		</div>
	);
}
