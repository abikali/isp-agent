"use client";

import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	BanknoteIcon,
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	CopyIcon,
	MapPinIcon,
	MessageCircleIcon,
	NavigationIcon,
	PhoneIcon,
	SendIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useRequestLocation } from "../hooks/use-billing";
import { calculateTotalDue, getExpiryInfo } from "../lib/billing-utils";
import { formatWhatsAppLink } from "../lib/whatsapp";

export interface UnpaidCustomer {
	id: string;
	firstName?: string | null;
	lastName?: string | null;
	username?: string | null;
	mobile?: string | null;
	phone?: string | null;
	address?: string | null;
	groupName?: string | null;
	expiresAt?: string | Date | null;
	monthlyRate?: number | null;
	discount?: number | null;
	iptvPrice?: number | null;
	realIpPrice?: number | null;
	latitude?: number | null;
	longitude?: number | null;
	plan?: { name: string; monthlyPrice?: number | null } | null;
	collector?: { id: string; name: string } | null;
}

interface CustomerCardProps {
	customer: UnpaidCustomer;
	onPay: (customer: UnpaidCustomer) => void;
}

function formatDateDMY(date: Date): string {
	const d = String(date.getDate()).padStart(2, "0");
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const y = date.getFullYear();
	return `${d}/${m}/${y}`;
}

function CopyButton({ value }: { value: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}, [value]);

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
			title="Copy"
		>
			{copied ? (
				<CheckIcon className="size-3 text-green-600" />
			) : (
				<CopyIcon className="size-3" />
			)}
		</button>
	);
}

export function CustomerCard({ customer, onPay }: CustomerCardProps) {
	const [expanded, setExpanded] = useState(false);
	const organizationId = useOrganizationId();
	const requestLocation = useRequestLocation();

	const name = displayName(customer.firstName, customer.lastName);
	const totalDue = calculateTotalDue(customer);

	const expiry = getExpiryInfo(customer.expiresAt ?? null);
	const expiryDateLabel = customer.expiresAt
		? formatDateDMY(new Date(customer.expiresAt))
		: "";
	const waLink = formatWhatsAppLink(customer.mobile ?? customer.phone);
	const phoneNumber = customer.mobile ?? customer.phone;
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
							<span className="flex items-center gap-1">
								<CalendarIcon className="size-3" />
								{expiryDateLabel || "No expiry"}
							</span>
						</div>
					</div>
					<div className="text-right shrink-0">
						<p className="text-xs text-muted-foreground">
							Amount due
						</p>
						<p className="text-lg font-bold tabular-nums">
							{formatCurrency(totalDue)}
						</p>
					</div>
				</div>

				{/* Expiry warning badge (only when expired or expiring soon) */}
				{expiry.label && (
					<div className="mt-2">
						<Badge variant={expiry.variant} className="text-xs">
							{expiry.label}
						</Badge>
					</div>
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
							{phoneNumber && (
								<div>
									<p className="text-xs font-medium text-muted-foreground">
										Phone
									</p>
									<p className="flex items-center">
										{phoneNumber}
										<CopyButton value={phoneNumber} />
									</p>
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
									<p className="text-green-600 dark:text-green-400">
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
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									disabled={requestLocation.isPending}
									onClick={() => {
										if (!organizationId) {
											return;
										}
										requestLocation.mutate(
											{
												organizationId,
												customerId: customer.id,
											},
											{
												onSuccess: (data) => {
													if (data.success) {
														toast.success(
															"Location sent to Telegram",
														);
													} else {
														window.open(
															data.mapsLink,
															"_blank",
														);
														toast.info(
															"Telegram not available, opened Maps",
														);
													}
												},
												onError: (error) => {
													toast.error(error.message);
												},
											},
										);
									}}
								>
									<SendIcon className="mr-1.5 size-3.5" />
									{requestLocation.isPending
										? "Sending..."
										: "Send to Telegram"}
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
							className="size-11 shrink-0 text-green-600"
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
