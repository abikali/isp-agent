"use client";

import { parsePhones } from "@repo/database/phones";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import {
	BanknoteIcon,
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	CopyIcon,
	HandCoinsIcon,
	MapPinIcon,
	MessageCircleIcon,
	NavigationIcon,
	PhoneIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { customerMonthlyDue, getExpiryInfo } from "../lib/billing-utils";
import { formatWhatsAppLink } from "../lib/whatsapp";

export interface UnpaidCustomer {
	id: string;
	externalId?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	username?: string | null;
	mobile?: string | null;
	phone?: string | null;
	phones?: unknown;
	address?: string | null;
	groupName?: string | null;
	oldestUnpaidExpiry?: string | Date | null;
	monthlyRate?: number | null;
	discount?: number | null;
	iptvPrice?: number | null;
	realIpPrice?: number | null;
	latitude?: number | null;
	longitude?: number | null;
	planId?: string | null;
	plan?: {
		id?: string;
		name: string;
		monthlyPrice?: number | null;
		externalId?: string | null;
	} | null;
	collector?: { id: string; name: string } | null;
	unpaidMonths?: number;
	accumulatedDue?: number;
	pastDueMonths?: number;
	pastDueAmount?: number;
	// Debt ("dein") visits already logged against the unpaid months shown
	// here. Optional so customer shapes fetched from other endpoints still fit.
	debtCount?: number;
	lastDebtNote?: string | null;
	lastDebtAt?: string | Date | null;
}

interface CustomerCardProps {
	customer: UnpaidCustomer;
	onPay: (customer: UnpaidCustomer) => void;
}

function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [value]);

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={handleCopy}
			className="ml-1 size-5 text-muted-foreground"
			title="Copy"
		>
			{copied ? (
				<CheckIcon className="size-3 text-success" />
			) : (
				<CopyIcon className="size-3" />
			)}
		</Button>
	);
}

export function CustomerCard({ customer, onPay }: CustomerCardProps) {
	const [expanded, setExpanded] = useState(false);
	const name = displayName(customer.firstName, customer.lastName);
	const monthlyDue = customerMonthlyDue(customer);
	const totalDue = customer.accumulatedDue ?? monthlyDue;
	const pastDueMonths = customer.pastDueMonths ?? 0;
	const unpaidMonths = customer.unpaidMonths ?? 1;

	const expiry = getExpiryInfo(customer.oldestUnpaidExpiry ?? null);
	const expiryDateLabel = customer.oldestUnpaidExpiry
		? formatDate(customer.oldestUnpaidExpiry)
		: "";
	// A debt visit settles nothing, so the customer stays on this list. The
	// marker is what stops the collector calling on him a second time blind.
	const debtCount = customer.debtCount ?? 0;
	const lastDebtLabel = customer.lastDebtAt
		? formatDate(customer.lastDebtAt)
		: "";
	// All of the customer's numbers, primary first — customers often carry
	// several and the collector needs every one, not just the primary.
	const parsedPhones = [...parsePhones(customer.phones)].sort(
		(a, b) => Number(b.primary) - Number(a.primary),
	);
	const phoneNumbers = parsedPhones.length
		? parsedPhones.map((p) => p.number)
		: [customer.mobile ?? customer.phone].filter((n): n is string =>
				Boolean(n),
			);
	const phoneNumber = phoneNumbers[0] ?? null;
	const waLink = formatWhatsAppLink(phoneNumber);
	const hasLocation = customer.latitude && customer.longitude;

	return (
		<Card className="overflow-hidden">
			<CardContent className="p-4">
				{/* Header: name + subtitle | amount */}
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<p className="truncate text-lg font-semibold leading-tight">
							{name}
						</p>
						<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
							{customer.groupName && (
								<span className="flex items-center gap-1">
									<MapPinIcon className="size-3" />
									{customer.groupName}
								</span>
							)}
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="flex items-center gap-1 cursor-default">
										<CalendarIcon className="size-3" />
										{expiryDateLabel || "No billing expiry"}
									</span>
								</TooltipTrigger>
								<TooltipContent>Billing Expiry</TooltipContent>
							</Tooltip>
						</div>
						{customer.address && (
							<p className="mt-1 truncate text-sm text-muted-foreground">
								{customer.address}
							</p>
						)}
					</div>
					<div className="text-right shrink-0">
						<p className="text-xs text-muted-foreground">
							{pastDueMonths > 0 ? "Total due" : "Amount due"}
						</p>
						<p className="text-lg font-bold tabular-nums">
							{formatCurrency(totalDue)}
						</p>
						{unpaidMonths > 1 && (
							<p className="text-xs text-muted-foreground tabular-nums">
								{/* Partially-paid months carry only their
								    remainder, so rate × months can overstate
								    the total — only show the multiplication
								    when it actually adds up. */}
								{Math.abs(
									monthlyDue * unpaidMonths - totalDue,
								) < 0.01
									? `${formatCurrency(monthlyDue)}/mo × ${unpaidMonths}`
									: `${unpaidMonths} months owed`}
							</p>
						)}
					</div>
				</div>

				{/* Badges: past due + expiry warning + already-logged debt */}
				{(pastDueMonths > 0 || expiry.label || debtCount > 0) && (
					<div className="mt-2 flex flex-wrap gap-1.5">
						{pastDueMonths > 0 && (
							<Badge variant="destructive" className="text-xs">
								{pastDueMonths}{" "}
								{pastDueMonths === 1 ? "month" : "months"} past
								due
							</Badge>
						)}
						{expiry.label && (
							<Badge variant={expiry.variant} className="text-xs">
								{expiry.label}
							</Badge>
						)}
						{debtCount > 0 && (
							<Badge
								variant="warning"
								className="gap-1 text-xs"
								title="A debt visit was already logged — the money is still owed"
							>
								<HandCoinsIcon className="size-3" />
								{debtCount > 1 ? `Debt ×${debtCount}` : "Debt"}
								{lastDebtLabel ? ` · ${lastDebtLabel}` : ""}
							</Badge>
						)}
					</div>
				)}

				{/* The note is the whole point of a debt visit — what the
				    customer actually promised. Show it without needing to
				    expand the card. */}
				{customer.lastDebtNote && (
					<p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
						<HandCoinsIcon className="mt-0.5 size-3 shrink-0" />
						<span className="italic">
							&ldquo;{customer.lastDebtNote}&rdquo;
						</span>
					</p>
				)}

				{/* Expandable details */}
				{expanded && (
					<div className="mt-3 rounded-lg bg-muted/50 p-3">
						<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
							{customer.address && (
								<div className="col-span-2">
									<p className="text-xs font-medium text-muted-foreground">
										Address
									</p>
									<p className="flex items-center">
										{customer.address}
										<CopyButton value={customer.address} />
									</p>
								</div>
							)}
							{phoneNumbers.length > 0 && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										{phoneNumbers.length > 1
											? `Phones (${phoneNumbers.length})`
											: "Phone"}
									</p>
									{phoneNumbers.map((number) => (
										<p
											key={number}
											className="flex items-center"
										>
											<a
												href={`tel:${number}`}
												className="hover:underline"
											>
												{number}
											</a>
											<CopyButton value={number} />
										</p>
									))}
								</div>
							)}
							{customer.username && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										Username
									</p>
									<p className="flex items-center font-mono text-xs">
										{customer.username}
										<CopyButton value={customer.username} />
									</p>
								</div>
							)}
							{(customer.discount ?? 0) > 0 && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										Discount
									</p>
									<p className="text-success">
										-
										{formatCurrency(customer.discount ?? 0)}
									</p>
								</div>
							)}
							{(customer.iptvPrice ?? 0) > 0 && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										IPTV
									</p>
									<p>
										{formatCurrency(
											customer.iptvPrice ?? 0,
										)}
									</p>
								</div>
							)}
							{(customer.realIpPrice ?? 0) > 0 && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										Real IP
									</p>
									<p>
										{formatCurrency(
											customer.realIpPrice ?? 0,
										)}
									</p>
								</div>
							)}
						</div>

						{/* Location actions */}
						{hasLocation && (
							<div className="mt-3 flex gap-2">
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									asChild
								>
									<a
										href={`https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}`}
										target="_blank"
										rel="noopener noreferrer"
									>
										<NavigationIcon className="mr-1.5 size-3.5" />
										Get Directions
									</a>
								</Button>
							</div>
						)}
					</div>
				)}

				{/* Action row */}
				<div className="mt-3 flex items-center gap-2">
					<Button
						variant="primary"
						size="lg"
						className="flex-1 text-base font-semibold"
						onClick={() => onPay(customer)}
					>
						<BanknoteIcon className="mr-1.5 size-4" />
						Pay
					</Button>

					{phoneNumber && (
						<Button
							variant="outline"
							size="icon"
							className="size-11 shrink-0"
							asChild
						>
							<a
								href={`tel:${phoneNumber}`}
								aria-label="Call customer"
								title="Call"
							>
								<PhoneIcon className="size-4" />
							</a>
						</Button>
					)}

					{waLink && (
						<Button
							variant="outline"
							size="icon"
							className="size-11 shrink-0 text-success"
							asChild
						>
							<a
								href={waLink}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Message on WhatsApp"
								title="WhatsApp"
							>
								<MessageCircleIcon className="size-4" />
							</a>
						</Button>
					)}

					<Button
						variant="ghost"
						size="icon"
						className="size-11 shrink-0"
						onClick={() => setExpanded(!expanded)}
						aria-label={expanded ? "Hide details" : "Show details"}
						title={expanded ? "Hide details" : "Show details"}
					>
						{expanded ? (
							<ChevronUpIcon className="size-4" />
						) : (
							<ChevronDownIcon className="size-4" />
						)}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
