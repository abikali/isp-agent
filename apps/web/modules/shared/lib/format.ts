const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number | bigint): string {
	let value = typeof bytes === "bigint" ? Number(bytes) : bytes;
	if (value === 0) {
		return "0 B";
	}
	let unitIndex = 0;
	while (Math.abs(value) >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	const unit = BYTE_UNITS[unitIndex] ?? "B";
	return `${value.toFixed(value < 10 && unitIndex > 0 ? 2 : value < 100 && unitIndex > 0 ? 1 : 0)} ${unit}`;
}

export function formatCurrency(value: number, currency = "$"): string {
	return `${currency}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number | bigint): string {
	const num = typeof value === "bigint" ? Number(value) : value;
	return num.toLocaleString();
}

export function truncate(str: string, max: number): string {
	return str.length > max ? `${str.slice(0, max)}...` : str;
}
