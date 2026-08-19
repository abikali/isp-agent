"use client";

import { formatWhatsAppLink } from "@saas/billing/lib/whatsapp";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { cn } from "@ui/lib";
import { MessageCircleIcon, PhoneIcon } from "lucide-react";

/**
 * Call / WhatsApp buttons for a customer who may have several numbers.
 *
 * With one number each button is a plain link (one tap, no prompt). With
 * several, the button opens a picker asking which number to use — a customer
 * often gives a landline plus one or two mobiles, and only one of them is on
 * WhatsApp, so guessing the primary sends the tech to a dead chat.
 *
 * Rendered as two sibling buttons (no wrapper) so the caller controls the
 * action row — worker cards put a Directions button alongside them.
 */
export function PhoneActions({
	numbers,
	className,
}: {
	numbers: string[];
	className?: string | undefined;
}) {
	if (numbers.length === 0) {
		return null;
	}

	const buttonClass = cn("h-8 flex-1 basis-20 text-xs", className);
	const whatsAppNumbers = numbers.filter((n) => formatWhatsAppLink(n));
	const [firstNumber] = numbers;
	const [firstWhatsApp] = whatsAppNumbers;

	return (
		<>
			{numbers.length === 1 && firstNumber ? (
				<Button
					variant="outline"
					size="sm"
					className={buttonClass}
					asChild
				>
					<a href={`tel:${firstNumber}`}>
						<PhoneIcon />
						Call
					</a>
				</Button>
			) : (
				<NumberPicker
					label="Which number do you want to call?"
					numbers={numbers}
					href={(number) => `tel:${number}`}
					className={buttonClass}
					icon={<PhoneIcon />}
					text="Call"
				/>
			)}

			{whatsAppNumbers.length === 1 && firstWhatsApp ? (
				<Button
					variant="outline"
					size="sm"
					className={buttonClass}
					asChild
				>
					<a
						href={formatWhatsAppLink(firstWhatsApp) ?? "#"}
						target="_blank"
						rel="noopener noreferrer"
					>
						<MessageCircleIcon />
						WhatsApp
					</a>
				</Button>
			) : whatsAppNumbers.length > 1 ? (
				<NumberPicker
					label="Which number do you want to message?"
					numbers={whatsAppNumbers}
					href={(number) => formatWhatsAppLink(number) ?? "#"}
					external
					className={buttonClass}
					icon={<MessageCircleIcon />}
					text="WhatsApp"
				/>
			) : null}
		</>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- private picker for PhoneActions, meaningless on its own
function NumberPicker({
	label,
	numbers,
	href,
	external,
	className,
	icon,
	text,
}: {
	label: string;
	numbers: string[];
	href: (number: string) => string;
	external?: boolean | undefined;
	className?: string | undefined;
	icon: React.ReactNode;
	text: string;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className={className}>
					{icon}
					{text}
				</Button>
			</DropdownMenuTrigger>
			{/* Anchored to the button and width-capped so long international
			    numbers still fit inside a narrow phone viewport. */}
			<DropdownMenuContent align="start" className="max-w-[85vw]">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					{label}
				</DropdownMenuLabel>
				{numbers.map((number) => (
					<DropdownMenuItem key={number} asChild>
						<a
							href={href(number)}
							{...(external
								? {
										target: "_blank",
										rel: "noopener noreferrer",
									}
								: {})}
							className="font-mono text-sm"
						>
							{number}
						</a>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
