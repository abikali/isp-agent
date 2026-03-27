"use client";

import { displayName } from "@shared/lib/display-name";
import { formatCurrency } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	BanknoteIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	MapPinIcon,
	MessageCircleIcon,
	PhoneIcon,
} from "lucide-react";
import { useState } from "react";
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

function getExpiryStatus(expiresAt: UnpaidCustomer["expiresAt"]): {
	label: string;
	variant: "destructive" | "secondary" | "outline";
} {
	if (!expiresAt) {
		return { label: "No expiry", variant: "secondary" };
	}

	const expiry = new Date(expiresAt);
	const now = new Date();
	const diffDays = Math.floor(
		(expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays < 0) {
		return {
			label: `Expired ${Math.abs(diffDays)}d ago`,
			variant: "destructive",
		};
	}
	if (diffDays <= 7) {
		return { label: `Expires in ${diffDays}d`, variant: "secondary" };
	}
	return {
		label: expiry.toLocaleDateString(),
		variant: "outline",
	};
}

export function CustomerCard({ customer, onPay }: CustomerCardProps) {
	const [expanded, setExpanded] = useState(false);

	const name = displayName(customer.firstName, customer.lastName);
	const accountPrice =
		customer.monthlyRate ?? customer.plan?.monthlyPrice ?? 0;
	const totalDue =
		accountPrice +
		(customer.iptvPrice ?? 0) +
		(customer.realIpPrice ?? 0) -
		(customer.discount ?? 0);

	const expiry = getExpiryStatus(customer.expiresAt);
	const waLink = formatWhatsAppLink(customer.mobile ?? customer.phone);
	const phoneNumber = customer.mobile ?? customer.phone;
	const hasLocation = customer.latitude && customer.longitude;

	return (
		<Card className="overflow-hidden">
			<CardContent className="p-4">
				{/* Main info row */}
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<p className="truncate text-lg font-semibold leading-tight">
							{name}
						</p>
						<p className="mt-0.5 text-sm text-muted-foreground">
							{customer.plan?.name ?? "No plan"}
						</p>
					</div>
					<div className="text-right shrink-0">
						<p className="text-lg font-bold tabular-nums">
							{formatCurrency(totalDue)}
						</p>
						<Badge
							variant={expiry.variant}
							className="text-xs mt-0.5"
						>
							{expiry.label}
						</Badge>
					</div>
				</div>

				{/* Group tag */}
				{customer.groupName && (
					<div className="mt-2">
						<Badge variant="outline" className="text-xs">
							{customer.groupName}
						</Badge>
					</div>
				)}

				{/* Expandable details */}
				{expanded && (
					<div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
						{customer.address && (
							<p className="text-muted-foreground">
								{customer.address}
							</p>
						)}
						{phoneNumber && (
							<p className="text-muted-foreground">
								{phoneNumber}
							</p>
						)}
						{customer.username && (
							<p className="font-mono text-xs text-muted-foreground">
								{customer.username}
							</p>
						)}
						{(customer.discount ?? 0) > 0 && (
							<p className="text-xs text-muted-foreground">
								Discount:{" "}
								{formatCurrency(customer.discount ?? 0)}
							</p>
						)}
						{(customer.iptvPrice ?? 0) > 0 && (
							<p className="text-xs text-muted-foreground">
								IPTV: {formatCurrency(customer.iptvPrice ?? 0)}
							</p>
						)}
						{(customer.realIpPrice ?? 0) > 0 && (
							<p className="text-xs text-muted-foreground">
								Real IP:{" "}
								{formatCurrency(customer.realIpPrice ?? 0)}
							</p>
						)}
						{hasLocation && (
							<Button
								variant="outline"
								size="sm"
								className="w-full"
								asChild
							>
								<a
									href={`https://www.google.com/maps/dir/?api=1&destination=${customer.latitude},${customer.longitude}`}
									target="_blank"
									rel="noopener noreferrer"
								>
									<MapPinIcon className="mr-1.5 size-3.5" />
									Navigate
								</a>
							</Button>
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
							<a href={`tel:${phoneNumber}`} aria-label="Call">
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
								aria-label="WhatsApp"
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
						aria-label={expanded ? "Show less" : "Show more"}
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
