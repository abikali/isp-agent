"use client";

import { Input } from "@ui/components/input";
import { COUNTRY_CODES, parsePhone } from "@ui/components/phone-input-utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { cn } from "@ui/lib";

interface PhoneInputProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
	placeholder?: string;
}

function PhoneInput({
	value,
	onChange,
	disabled,
	className,
	placeholder = "Phone number",
}: PhoneInputProps) {
	const { dialCode, localNumber } = parsePhone(value);

	function handleDialCodeChange(newDialCode: string) {
		onChange(`${newDialCode}${localNumber}`);
	}

	function handleLocalChange(e: React.ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value.replace(/[^\d]/g, "");
		onChange(`${dialCode}${raw}`);
	}

	const entry = COUNTRY_CODES.find((c) => c.dialCode === dialCode);

	return (
		<div className={cn("flex min-w-0", className)}>
			<Select
				value={dialCode}
				onValueChange={handleDialCodeChange}
				disabled={disabled}
			>
				<SelectTrigger className="w-[5rem] shrink-0 rounded-r-none border-r-0 gap-0.5 px-1.5 [&>svg]:hidden">
					<SelectValue>
						{entry ? (
							<span className="flex items-center gap-1">
								<span className="text-base leading-none">
									{entry.flag}
								</span>
								<span className="text-[11px] text-muted-foreground">
									{entry.dialCode}
								</span>
							</span>
						) : (
							dialCode
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{COUNTRY_CODES.map((c) => (
						<SelectItem key={c.code} value={c.dialCode}>
							<span className="flex items-center gap-2">
								<span className="text-base leading-none">
									{c.flag}
								</span>
								<span>{c.name}</span>
								<span className="text-muted-foreground">
									{c.dialCode}
								</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Input
				type="tel"
				inputMode="tel"
				value={localNumber}
				onChange={handleLocalChange}
				placeholder={placeholder}
				disabled={disabled}
				className="min-w-0 rounded-l-none"
			/>
		</div>
	);
}

export { PhoneInput };
