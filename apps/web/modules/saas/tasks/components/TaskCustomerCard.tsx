"use client";

import { displayName } from "@shared/lib/display-name";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/components/card";
import { Separator } from "@ui/components/separator";
import {
	DollarSignIcon,
	ExternalLinkIcon,
	MailIcon,
	MapPinIcon,
	PhoneIcon,
	TagIcon,
	UserIcon,
	WifiIcon,
} from "lucide-react";

interface TaskCustomerCardProps {
	customer: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		accountNumber: string;
		email?: string | null;
		phone?: string | null;
		address?: string | null;
		status: string;
		connectionType?: string | null;
		monthlyRate?: number | null;
		plan?: { id: string; name: string } | null;
		station?: { id: string; name: string } | null;
	};
	organizationSlug: string;
}

export function TaskCustomerCard({
	customer,
	organizationSlug,
}: TaskCustomerCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-base">Customer</CardTitle>
				<Link
					to="/app/$organizationSlug/customers/$customerId"
					params={{
						organizationSlug,
						customerId: customer.id,
					}}
					preload="intent"
				>
					<Button variant="ghost" size="sm">
						View
						<ExternalLinkIcon className="ml-1 size-3" />
					</Button>
				</Link>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-center gap-3">
					<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
						<UserIcon className="size-5" />
					</div>
					<div>
						<p className="font-medium">
							{displayName(customer.firstName, customer.lastName)}
						</p>
						<p className="text-xs text-muted-foreground">
							#{customer.accountNumber}
						</p>
					</div>
					<Badge
						variant={
							customer.status === "ACTIVE"
								? "default"
								: "secondary"
						}
						className="ml-auto text-[10px]"
					>
						{customer.status}
					</Badge>
				</div>
				<Separator />
				<div className="space-y-2 text-sm">
					{customer.phone && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<PhoneIcon className="size-3.5 shrink-0" />
							<span>{customer.phone}</span>
						</div>
					)}
					{customer.email && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<MailIcon className="size-3.5 shrink-0" />
							<span className="truncate">{customer.email}</span>
						</div>
					)}
					{customer.address && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<MapPinIcon className="size-3.5 shrink-0" />
							<span>{customer.address}</span>
						</div>
					)}
					{customer.connectionType && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<WifiIcon className="size-3.5 shrink-0" />
							<span>{customer.connectionType}</span>
						</div>
					)}
					{customer.plan && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<TagIcon className="size-3.5 shrink-0" />
							<span>{customer.plan.name}</span>
						</div>
					)}
					{customer.monthlyRate != null && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<DollarSignIcon className="size-3.5 shrink-0" />
							<span>${customer.monthlyRate.toFixed(2)}/mo</span>
						</div>
					)}
					{customer.station && (
						<div className="flex items-center gap-2 text-muted-foreground">
							<MapPinIcon className="size-3.5 shrink-0" />
							<span>Station: {customer.station.name}</span>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
