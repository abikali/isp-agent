"use client";

import { parsePhones } from "@repo/database/phones";
import {
	formatLebaneseLandline,
	parsePhone,
	toLebaneseLandline,
} from "@repo/utils";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { cn } from "@ui/lib";
import { CheckIcon, PhoneIcon, XIcon } from "lucide-react";
import type { UnpaidCustomer } from "./CustomerCard";

/**
 * "Does the customer have a landline?" on the collector payment sheet. Jhonny
 * wants every customer's home line for the fiber campaign, so the question is
 * asked until it has been answered once; after that the saved answer is shown
 * with a Change button instead of asking again every month.
 */
export interface LandlineAnswer {
	/** True while the question is open (never answered, or Change tapped). */
	editing: boolean;
	has: boolean | null;
	number: string;
}

export function initialLandlineAnswer(
	customer: UnpaidCustomer,
): LandlineAnswer {
	// A landline typed into the phone list before this question existed is
	// offered as the answer — the collector still taps Yes to confirm it.
	const fromPhones = [
		customer.phone,
		...parsePhones(customer.phones).map((p) => p.number),
	]
		.map((n) => toLebaneseLandline(n))
		.find((n) => n !== null);
	const saved = customer.landline ?? fromPhones;
	return {
		editing: customer.hasLandline == null,
		has: customer.hasLandline ?? null,
		number: saved ? formatLebaneseLandline(saved) : "",
	};
}

/** A customer nobody has asked yet — the starting point when creating one. */
export const UNANSWERED_LANDLINE: LandlineAnswer = {
	editing: true,
	has: null,
	number: "",
};

/** What to send with the payment; undefined leaves the saved answer alone. */
export function landlineSubmission(
	answer: LandlineAnswer,
): { has: true; number: string } | { has: false } | undefined {
	if (!answer.editing || answer.has === null) {
		return undefined;
	}
	return answer.has ? { has: true, number: answer.number } : { has: false };
}

/** Why the payment can't be submitted yet, or null. */
export function landlineError(
	answer: LandlineAnswer,
	required: boolean,
): string | null {
	if (!answer.editing) {
		return null;
	}
	if (answer.has === null) {
		return required ? "Ask the customer if they have a landline" : null;
	}
	if (answer.has && !toLebaneseLandline(answer.number)) {
		return "Enter the landline with its area code, e.g. 04 123456";
	}
	return null;
}

interface LandlineQuestionProps {
	value: LandlineAnswer;
	onChange: (value: LandlineAnswer) => void;
	required: boolean;
}

export function LandlineQuestion({
	value,
	onChange,
	required,
}: LandlineQuestionProps) {
	if (!value.editing) {
		return (
			<div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
				<p className="flex items-center gap-2 text-sm">
					<PhoneIcon className="size-4 text-muted-foreground" />
					{value.has ? (
						<>
							Landline{" "}
							<span
								className="font-semibold tabular-nums"
								dir="ltr"
							>
								{value.number}
							</span>
						</>
					) : (
						<span className="text-muted-foreground">
							No landline
						</span>
					)}
				</p>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => onChange({ ...value, editing: true })}
				>
					Change
				</Button>
			</div>
		);
	}

	const typed = value.number.trim();
	const isMobile =
		typed.length >= 7 &&
		parsePhone(typed) !== null &&
		toLebaneseLandline(typed) === null;
	const showInvalid =
		value.has === true &&
		typed.replace(/\D/g, "").length >= 8 &&
		!toLebaneseLandline(typed);

	return (
		<div
			className={cn(
				"space-y-2 rounded-lg border p-3",
				required &&
					value.has === null &&
					"border-amber-500/50 bg-amber-500/5",
			)}
		>
			<div>
				<p className="flex items-center gap-2 text-sm font-medium">
					<PhoneIcon className="size-4" />
					Home landline? (خط أرضي)
					{required && <span className="text-destructive">*</span>}
				</p>
				<p className="text-xs text-muted-foreground">
					Ask the customer if they have a landline at home.
				</p>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<Button
					type="button"
					variant={value.has === true ? "success-soft" : "outline"}
					className="h-11 text-base"
					aria-pressed={value.has === true}
					onClick={() => onChange({ ...value, has: true })}
				>
					<CheckIcon />
					Yes · نعم
				</Button>
				<Button
					type="button"
					variant={
						value.has === false ? "destructive-soft" : "outline"
					}
					className="h-11 text-base"
					aria-pressed={value.has === false}
					onClick={() => onChange({ ...value, has: false })}
				>
					<XIcon />
					No · لا
				</Button>
			</div>
			{value.has === true && (
				<div className="space-y-1">
					<Label htmlFor="sheet-landline" className="text-xs">
						Landline number
					</Label>
					<Input
						id="sheet-landline"
						type="tel"
						inputMode="tel"
						dir="ltr"
						autoComplete="off"
						placeholder="04 123456"
						value={value.number}
						onChange={(e) =>
							onChange({ ...value, number: e.target.value })
						}
						aria-invalid={isMobile || showInvalid || undefined}
						className="h-11 text-lg tabular-nums"
					/>
					{isMobile ? (
						<p className="text-xs text-destructive">
							This is a mobile number — put it under Phone above.
						</p>
					) : showInvalid ? (
						<p className="text-xs text-destructive">
							Not a landline. Area code + 6 digits, e.g. 01
							234567.
						</p>
					) : (
						<p className="text-xs text-muted-foreground">
							Area code + number: 01, 04, 05, 06, 07, 08 or 09.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
