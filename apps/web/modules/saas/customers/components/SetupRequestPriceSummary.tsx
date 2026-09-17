"use client";

import { formatCurrency } from "@shared/lib/format";
import { Button } from "@ui/components/button";

/**
 * "Monthly bill: $30 plan − $5 discount = $25/month", plus a nudge when the
 * first charge doesn't match what iRadius will invoice for the first month.
 * The nudge never changes the charge itself — it's cash the worker collected.
 */
export function SetupRequestPriceSummary({
	planChanged,
	rate,
	discount,
	iptv,
	realIp,
	discountTooLarge,
	chargeHintAmount,
	onUseChargeHint,
}: {
	planChanged: boolean;
	rate: number;
	discount: number;
	iptv: number;
	realIp: number;
	discountTooLarge: boolean;
	chargeHintAmount: number | null;
	onUseChargeHint: () => void;
}) {
	if (planChanged) {
		return (
			<p className="rounded-md bg-muted/40 p-3 text-muted-foreground text-xs">
				Plan changed — the monthly price follows the new plan once
				saved.
			</p>
		);
	}
	const parts = [
		`${formatCurrency(rate)} plan`,
		discount > 0 ? `− ${formatCurrency(discount)} discount` : null,
		iptv > 0 ? `+ ${formatCurrency(iptv)} IPTV` : null,
		realIp > 0 ? `+ ${formatCurrency(realIp)} Real IP` : null,
	].filter(Boolean);
	const addons = iptv + realIp > 0;
	return (
		<div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
			<p>
				Monthly bill: {parts.join(" ")} ={" "}
				<span className="font-medium tabular-nums">
					{formatCurrency(
						Math.max(0, rate + iptv + realIp - discount),
					)}
					/month
				</span>
			</p>
			{discountTooLarge && (
				<p className="text-destructive text-xs">
					The discount can't be more than the monthly bill.
				</p>
			)}
			{chargeHintAmount !== null && !discountTooLarge && (
				<div className="flex flex-wrap items-center justify-between gap-2 text-warning text-xs">
					<span>
						iRadius will invoice {formatCurrency(chargeHintAmount)}{" "}
						for the first month
						{addons
							? " (add-ons are collected on their own lines)"
							: ""}
						. Did the worker collect{" "}
						{formatCurrency(chargeHintAmount)}?
					</span>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onUseChargeHint}
					>
						Use {formatCurrency(chargeHintAmount)}
					</Button>
				</div>
			)}
		</div>
	);
}
