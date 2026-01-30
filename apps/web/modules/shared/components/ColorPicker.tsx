"use client";

import * as Popover from "@radix-ui/react-popover";
import { HEX_COLOR_PATTERN } from "@repo/api/lib/validation";
import { Input } from "@ui/components/input";
import { cn } from "@ui/lib";
import { useCallback } from "react";
import { HexColorPicker } from "react-colorful";

interface ColorPickerProps {
	value: string;
	onChange: (value: string) => void;
	onBlur?: () => void;
	placeholder?: string;
	presets?: string[];
	className?: string;
	size?: "default" | "sm";
}

export function ColorPicker({
	value,
	onChange,
	onBlur,
	placeholder = "#000000",
	presets,
	className,
	size = "default",
}: ColorPickerProps) {
	const handleTextChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = e.target.value;
			// Allow typing partial hex values, but only call onChange for valid hex
			if (HEX_COLOR_PATTERN.test(newValue)) {
				onChange(newValue);
			}
		},
		[onChange],
	);

	const handlePresetClick = useCallback(
		(color: string) => {
			onChange(color);
			onBlur?.();
		},
		[onChange, onBlur],
	);

	const isSmall = size === "sm";

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex gap-2">
				<Popover.Root>
					<Popover.Trigger asChild>
						<button
							type="button"
							className={cn(
								"shrink-0 rounded-lg border shadow-sm transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
								isSmall ? "size-9" : "size-9",
							)}
							style={{ backgroundColor: value }}
							aria-label={`Pick color, current: ${value}`}
						/>
					</Popover.Trigger>
					<Popover.Portal>
						<Popover.Content
							className="z-50 rounded-lg border bg-popover p-3 shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
							sideOffset={5}
							onInteractOutside={onBlur}
						>
							<HexColorPicker
								color={value}
								onChange={onChange}
								className="!w-[200px]"
							/>
							{presets && presets.length > 0 && (
								<div className="mt-3 flex flex-wrap gap-1.5">
									{presets.map((color) => (
										<button
											key={color}
											type="button"
											onClick={() =>
												handlePresetClick(color)
											}
											className={cn(
												"size-6 rounded-md border transition-transform hover:scale-110",
												value.toLowerCase() ===
													color.toLowerCase() &&
													"ring-2 ring-primary ring-offset-1",
											)}
											style={{ backgroundColor: color }}
											aria-label={`Set color to ${color}`}
										/>
									))}
								</div>
							)}
						</Popover.Content>
					</Popover.Portal>
				</Popover.Root>

				{/* Text input for hex value */}
				<Input
					type="text"
					placeholder={placeholder}
					value={value}
					onChange={handleTextChange}
					onBlur={onBlur}
					className={cn("font-mono", isSmall ? "h-9 text-xs" : "")}
				/>
			</div>
		</div>
	);
}
