"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import type { CycleOption } from "../lib/billing-utils";

interface BillingCycleSelectProps {
	value: string;
	onValueChange: (value: string) => void;
	options: CycleOption[];
	/** Label for the "all" option. Omit to hide it. */
	allLabel?: string;
	placeholder?: string;
	className?: string;
}

export function BillingCycleSelect({
	value,
	onValueChange,
	options,
	allLabel,
	placeholder = "Billing cycle",
	className = "w-full sm:w-[150px]",
}: BillingCycleSelectProps) {
	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger className={className}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{allLabel && <SelectItem value="all">{allLabel}</SelectItem>}
				{options.map((opt) => (
					<SelectItem key={opt.value} value={opt.value}>
						{opt.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
