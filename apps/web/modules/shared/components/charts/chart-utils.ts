export const CHART_TOKENS = {
	c1: "var(--chart-1)",
	c2: "var(--chart-2)",
	c3: "var(--chart-3)",
	c4: "var(--chart-4)",
	c5: "var(--chart-5)",
	c6: "var(--chart-6)",
	grid: "var(--chart-grid)",
	axis: "var(--chart-axis)",
	tooltipBg: "var(--chart-tooltip-bg)",
} as const;

export function formatCurrency(
	value: number,
	currency = "USD",
	maximumFractionDigits = 0,
): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		maximumFractionDigits,
	}).format(value);
}

export function formatCompactCurrency(value: number, currency = "USD"): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) {
		return `${value < 0 ? "-" : ""}${formatCurrency(abs / 1_000_000, currency, 1)}M`;
	}
	if (abs >= 1_000) {
		return `${value < 0 ? "-" : ""}${formatCurrency(abs / 1_000, currency, 1)}k`;
	}
	return formatCurrency(value, currency);
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(
		sizes.length - 1,
		Math.floor(Math.log(Math.abs(bytes)) / Math.log(k)),
	);
	return `${(bytes / k ** i).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat("en-US").format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
	return `${value.toFixed(fractionDigits)}%`;
}

export function formatShortDate(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
