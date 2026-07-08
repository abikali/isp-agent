"use client";

import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { MinusIcon, PlusIcon } from "lucide-react";

interface QuantityInputProps {
	id?: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
}

/**
 * Numeric quantity field with −/+ stepper buttons. Mobile keyboards for
 * `type="number"` often have no minus key, so anything signed must be
 * expressed via UI (steppers / an add-remove toggle), never by typing "-".
 */
export function QuantityInput({
	id,
	value,
	onChange,
	min = 1,
	max,
}: QuantityInputProps) {
	function clamp(next: number): number {
		if (Number.isNaN(next)) {
			return min;
		}
		if (next < min) {
			return min;
		}
		if (max !== undefined && next > max) {
			return max;
		}
		return next;
	}

	return (
		<div className="flex items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="size-9 shrink-0"
				onClick={() => onChange(clamp(value - 1))}
				disabled={value <= min}
				aria-label="Decrease quantity"
			>
				<MinusIcon className="size-4" />
			</Button>
			<Input
				id={id}
				type="number"
				inputMode="numeric"
				min={min}
				max={max}
				value={value}
				onChange={(e) => onChange(clamp(Number(e.target.value)))}
				className="text-center font-mono tabular-nums"
			/>
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="size-9 shrink-0"
				onClick={() => onChange(clamp(value + 1))}
				disabled={max !== undefined && value >= max}
				aria-label="Increase quantity"
			>
				<PlusIcon className="size-4" />
			</Button>
		</div>
	);
}
