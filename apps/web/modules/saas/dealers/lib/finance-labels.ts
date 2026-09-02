import {
	ArrowDownLeftIcon,
	ArrowUpRightIcon,
	GiftIcon,
	type LucideIcon,
	MinusCircleIcon,
	PackageIcon,
	SlidersHorizontalIcon,
} from "lucide-react";

export type LedgerKind =
	| "top_up"
	| "deduction"
	| "payment"
	| "write_off"
	| "in_kind"
	| "adjustment";

export type PaymentKind = Exclude<LedgerKind, "top_up" | "deduction">;

export interface KindMeta {
	label: string;
	/** One line an owner understands without a glossary. */
	meaning: string;
	icon: LucideIcon;
	/** Tailwind classes for the icon chip. */
	chip: string;
}

export const LEDGER_KINDS: Record<LedgerKind, KindMeta> = {
	top_up: {
		label: "Credit added",
		meaning: "You gave the dealer prepaid credit. They owe you for it.",
		icon: ArrowUpRightIcon,
		chip: "bg-primary/10 text-primary",
	},
	deduction: {
		label: "Credit taken back",
		meaning: "Prepaid credit removed from the dealer. They owe you less.",
		icon: MinusCircleIcon,
		chip: "bg-muted text-muted-foreground",
	},
	payment: {
		label: "Payment received",
		meaning: "The dealer paid you.",
		icon: ArrowDownLeftIcon,
		chip: "bg-success/12 text-success",
	},
	write_off: {
		label: "Written off",
		meaning: "You forgave this amount.",
		icon: GiftIcon,
		chip: "bg-warning/12 text-warning",
	},
	in_kind: {
		label: "Settled in kind",
		meaning: "Goods or equipment accepted instead of cash.",
		icon: PackageIcon,
		chip: "bg-info/12 text-info",
	},
	adjustment: {
		label: "Adjustment",
		meaning: "A correction to the balance.",
		icon: SlidersHorizontalIcon,
		chip: "bg-muted text-muted-foreground",
	},
};

export const PAYMENT_KIND_OPTIONS: Array<{
	value: PaymentKind;
	label: string;
	hint: string;
}> = [
	{ value: "payment", label: "Cash", hint: "They paid you" },
	{ value: "write_off", label: "Write-off", hint: "You forgive it" },
	{ value: "in_kind", label: "In kind", hint: "Goods instead of cash" },
	{ value: "adjustment", label: "Adjustment", hint: "Fix a mistake" },
];

/** Days since a date, or null. */
export function daysSince(value: Date | string | null): number | null {
	if (!value) {
		return null;
	}
	const then = typeof value === "string" ? new Date(value) : value;
	// iRadius holds a few rows dated 1899-12-31 (a blank date picker).
	// Treat anything that old as "no date" rather than "1,500 months ago".
	if (then.getUTCFullYear() < 2000) {
		return null;
	}
	return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

export function relativeDays(value: Date | string | null): string {
	const days = daysSince(value);
	if (days === null) {
		return value ? "on an unknown date" : "never";
	}
	if (days <= 0) {
		return "today";
	}
	if (days === 1) {
		return "yesterday";
	}
	if (days < 30) {
		return `${days} days ago`;
	}
	const months = Math.floor(days / 30);
	return months === 1 ? "a month ago" : `${months} months ago`;
}
