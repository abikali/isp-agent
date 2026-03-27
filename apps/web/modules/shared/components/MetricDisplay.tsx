import { formatBytes, formatCurrency, formatNumber } from "@shared/lib/format";
import { cn } from "@ui/lib";

interface MetricDisplayProps {
	label: string;
	value: string | number | bigint;
	format?: "bytes" | "currency" | "number" | "raw";
	secondary?: string;
}

export function MetricDisplay({
	label,
	value,
	format = "raw",
	secondary,
}: MetricDisplayProps) {
	let formatted: string;
	switch (format) {
		case "bytes":
			formatted = formatBytes(
				typeof value === "string" ? Number.parseInt(value, 10) : value,
			);
			break;
		case "currency":
			formatted = formatCurrency(
				typeof value === "bigint" ? Number(value) : Number(value),
			);
			break;
		case "number":
			formatted = formatNumber(
				typeof value === "string" ? Number(value) : value,
			);
			break;
		default:
			formatted = String(value);
	}

	return (
		<div className="space-y-1">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className={cn("text-lg font-semibold tabular-nums")}>
				{formatted}
			</p>
			{secondary && (
				<p className="text-xs text-muted-foreground">{secondary}</p>
			)}
		</div>
	);
}
