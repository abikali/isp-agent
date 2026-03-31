"use client";

import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { cn } from "@ui/lib";
import { isValidPhoneNumber } from "libphonenumber-js";

const COUNTRY_CODES = [
	{
		code: "LB",
		dialCode: "+961",
		flag: "\u{1F1F1}\u{1F1E7}",
		name: "Lebanon",
	},
	{ code: "SY", dialCode: "+963", flag: "\u{1F1F8}\u{1F1FE}", name: "Syria" },
	{ code: "IQ", dialCode: "+964", flag: "\u{1F1EE}\u{1F1F6}", name: "Iraq" },
	{
		code: "JO",
		dialCode: "+962",
		flag: "\u{1F1EF}\u{1F1F4}",
		name: "Jordan",
	},
	{
		code: "PS",
		dialCode: "+970",
		flag: "\u{1F1F5}\u{1F1F8}",
		name: "Palestine",
	},
	{
		code: "SA",
		dialCode: "+966",
		flag: "\u{1F1F8}\u{1F1E6}",
		name: "Saudi Arabia",
	},
	{ code: "AE", dialCode: "+971", flag: "\u{1F1E6}\u{1F1EA}", name: "UAE" },
	{ code: "US", dialCode: "+1", flag: "\u{1F1FA}\u{1F1F8}", name: "US" },
] as const;

/** Sorted dial codes longest-first for greedy prefix matching */
const DIAL_CODES_DESC = COUNTRY_CODES.map((c) => c.dialCode).sort(
	(a, b) => b.length - a.length,
);

/**
 * Parse a full phone string into { dialCode, localNumber }.
 * Tries to match a known dial code prefix; defaults to +961.
 */
function parsePhone(value: string): { dialCode: string; localNumber: string } {
	const digits = value.replace(/[\s\-()]/g, "");

	if (digits.startsWith("+")) {
		for (const dc of DIAL_CODES_DESC) {
			if (digits.startsWith(dc)) {
				return { dialCode: dc, localNumber: digits.slice(dc.length) };
			}
		}
		// Unknown prefix — keep as-is with default code
		return { dialCode: "+961", localNumber: digits.replace(/^\+/, "") };
	}

	// No + prefix — assume Lebanon
	const raw = digits.replace(/^0/, ""); // strip leading 0
	return { dialCode: "+961", localNumber: raw };
}

/**
 * Normalize a phone number to international format.
 * "70442737" → "+96170442737"
 */
function toInternationalPhone(phone: string): string {
	const { dialCode, localNumber } = parsePhone(phone);
	return `${dialCode}${localNumber}`;
}

/**
 * Strip all non-digit chars except leading +.
 * "+961 70 442 737" → "+96170442737"
 */
function stripPhone(phone: string): string {
	const cleaned = phone.replace(/[\s\-()]/g, "");
	if (cleaned.startsWith("+")) {
		return `+${cleaned.slice(1).replace(/\D/g, "")}`;
	}
	return cleaned.replace(/\D/g, "");
}

/** Validate a phone number for the detected country using libphonenumber-js */
function isValidPhone(phone: string): boolean {
	const { dialCode, localNumber } = parsePhone(phone);
	if (localNumber.replace(/\D/g, "").length === 0) {
		return false;
	}
	const country = COUNTRY_CODES.find((c) => c.dialCode === dialCode);
	return isValidPhoneNumber(
		`${dialCode}${localNumber}`,
		country?.code as Parameters<typeof isValidPhoneNumber>[1],
	);
}

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

export {
	PhoneInput,
	COUNTRY_CODES,
	toInternationalPhone,
	stripPhone,
	isValidPhone,
	parsePhone,
};
