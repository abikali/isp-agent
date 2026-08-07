"use client";

import { useCustomerNetworkStatus } from "@saas/customers/client";
import { StatusIndicator } from "@shared/components/StatusIndicator";
import {
	formatCurrency,
	formatDate,
	MEDIUM_DATE_FORMAT,
} from "@shared/lib/format";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Skeleton } from "@ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	ArrowUpRightIcon,
	BotIcon,
	CalendarIcon,
	GaugeIcon,
	type LucideIcon,
	MapPinIcon,
	MessageSquareIcon,
	RadioTowerIcon,
	WalletIcon,
	WifiIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { getAvatarColor, getContactInitials } from "../lib/chat-utils";
import type { ConversationItem } from "./ConversationsListPanel";

interface ConversationContextPanelProps {
	conversation: ConversationItem | undefined;
	organizationId: string;
	organizationSlug: string;
	onClose?: () => void;
}

function fmtRelative(d: Date | string | null): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	const diffMs = Date.now() - date.getTime();
	const mins = Math.floor(diffMs / 60_000);
	if (mins < 1) {
		return "Just now";
	}
	if (mins < 60) {
		return `${mins}m ago`;
	}
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) {
		return `${hrs}h ago`;
	}
	return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDate(d: Date | string | null): string {
	if (!d) {
		return "—";
	}
	const date = typeof d === "string" ? new Date(d) : d;
	return formatDate(date, MEDIUM_DATE_FORMAT);
}

function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-2 px-4 py-3">
			<div className="flex items-center justify-between gap-2">
				<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					{title}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

function Row({
	label,
	value,
	icon: Icon,
}: {
	label: string;
	value: ReactNode;
	icon?: LucideIcon;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3 text-xs">
			<span className="inline-flex items-center gap-1.5 text-muted-foreground">
				{Icon ? (
					<Icon className="size-3 text-muted-foreground/80" />
				) : null}
				{label}
			</span>
			<span className="min-w-0 truncate text-right font-medium text-foreground">
				{value}
			</span>
		</div>
	);
}

function customerStatusType(
	status: string | null | undefined,
): "active" | "inactive" | "suspended" | "pending" {
	if (status === "ACTIVE") {
		return "active";
	}
	if (status === "SUSPENDED") {
		return "suspended";
	}
	if (status === "PENDING") {
		return "pending";
	}
	return "inactive";
}

interface CustomerSummary {
	id: string;
	accountNumber: string;
	username: string | null;
	firstName: string | null;
	lastName: string | null;
	mobile: string | null;
	address: string | null;
	status: string | null;
	online: boolean;
	monthlyRate: number | null;
	discount: number | null;
	balance: number | null;
	expiresAt: Date | string | null;
	connectionType: string | null;
	plan: {
		name: string;
		monthlyPrice: number | null;
		downloadSpeed: number | null;
		uploadSpeed: number | null;
	} | null;
	station: { name: string } | null;
	accessPoint: { name: string } | null;
}

interface LiveNetworkStatus {
	online: boolean;
	uptime?: string | null;
	signal?: string | null;
}

function NetworkStatusValue({
	name,
	live,
	kind,
}: {
	name: string;
	live: LiveNetworkStatus | null;
	kind: "station" | "accessPoint";
}) {
	return (
		<span className="flex min-w-0 items-center justify-end gap-1.5">
			<span className="min-w-0 truncate" title={name}>
				{name}
			</span>
			{live ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="shrink-0">
							<StatusIndicator
								status={live.online ? "online" : "offline"}
								variant="dot"
								size="sm"
							/>
						</span>
					</TooltipTrigger>
					<TooltipContent>{liveTooltip(live, kind)}</TooltipContent>
				</Tooltip>
			) : null}
		</span>
	);
}

function liveTooltip(
	live: LiveNetworkStatus,
	kind: "station" | "accessPoint",
): string {
	const lines: string[] = [
		`Live from iRadius — ${live.online ? "online" : "offline"}`,
	];
	if (live.uptime) {
		lines.push(`Uptime: ${live.uptime}`);
	}
	if (kind === "accessPoint" && live.signal) {
		lines.push(`Signal: ${live.signal}`);
	}
	return lines.join(" · ");
}

function CustomerCardContainer({
	customerId,
	organizationId,
	organizationSlug,
}: {
	customerId: string;
	organizationId: string;
	organizationSlug: string;
}) {
	const { data, isLoading } = useQuery(
		orpc.customers.get.queryOptions({
			input: { organizationId, id: customerId },
		}),
	);
	const customer = data?.customer;
	const customerSummary: CustomerSummary | null = customer
		? {
				id: customer.id,
				accountNumber: customer.accountNumber,
				username: customer.username ?? null,
				firstName: customer.firstName ?? null,
				lastName: customer.lastName ?? null,
				mobile: customer.mobile ?? null,
				address: customer.address ?? null,
				status: customer.status ?? null,
				online: customer.online ?? false,
				monthlyRate: customer.monthlyRate ?? null,
				discount: customer.discount ?? null,
				balance: customer.balance ?? null,
				expiresAt: customer.expiresAt ?? null,
				connectionType: customer.connectionType ?? null,
				plan: customer.plan
					? {
							name: customer.plan.name,
							monthlyPrice: customer.plan.monthlyPrice ?? null,
							downloadSpeed: customer.plan.downloadSpeed ?? null,
							uploadSpeed: customer.plan.uploadSpeed ?? null,
						}
					: null,
				station: customer.station
					? { name: customer.station.name }
					: null,
				accessPoint: customer.accessPoint
					? { name: customer.accessPoint.name }
					: null,
			}
		: null;
	return (
		<CustomerCard
			loading={isLoading}
			customer={customerSummary}
			customerId={customerId}
			organizationSlug={organizationSlug}
		/>
	);
}

function CustomerCard({
	loading,
	customer,
	customerId,
	organizationSlug,
}: {
	loading: boolean;
	customer: CustomerSummary | null;
	customerId: string;
	organizationSlug: string;
}) {
	const { station: liveStation, accessPoint: liveAccessPoint } =
		useCustomerNetworkStatus(customerId);

	if (loading) {
		return (
			<div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-3 w-20" />
			</div>
		);
	}
	if (!customer) {
		return null;
	}
	const fullName =
		[customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
		"Unnamed";
	const statusType = customerStatusType(customer.status);
	const effectiveMonthly =
		(customer.monthlyRate ?? customer.plan?.monthlyPrice ?? 0) -
		(customer.discount ?? 0);
	return (
		<div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="truncate text-sm font-semibold text-foreground">
						{fullName}
					</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-1.5">
						<Badge
							variant="secondary"
							className="h-4 px-1.5 font-mono text-[10px]"
						>
							#{customer.accountNumber}
						</Badge>
						{customer.username && (
							<span className="truncate font-mono text-[11px] text-muted-foreground">
								{customer.username}
							</span>
						)}
					</div>
				</div>
				<Button
					asChild
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					title="Open customer"
				>
					<Link
						to="/app/$organizationSlug/customers/$customerId"
						params={{
							organizationSlug,
							customerId: customer.id,
						}}
					>
						<ArrowUpRightIcon className="size-3.5" />
					</Link>
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				<StatusIndicator
					status={statusType}
					variant="badge"
					size="sm"
				/>
				<StatusIndicator
					status={customer.online ? "online" : "offline"}
					variant="badge"
					size="sm"
				/>
				{customer.connectionType && (
					<Badge
						variant="outline"
						className="h-5 px-1.5 text-[10px] capitalize"
					>
						{customer.connectionType.toLowerCase()}
					</Badge>
				)}
			</div>

			<div className="grid gap-1.5 border-t border-border/60 pt-2">
				{customer.plan?.name && (
					<Row
						label="Plan"
						icon={WifiIcon}
						value={
							<span className="inline-flex flex-col items-end gap-0">
								<span>{customer.plan.name}</span>
								{(customer.plan.downloadSpeed ||
									customer.plan.uploadSpeed) && (
									<span className="text-[10px] font-normal text-muted-foreground">
										{customer.plan.downloadSpeed ?? "?"}↓ /{" "}
										{customer.plan.uploadSpeed ?? "?"}↑ Mbps
									</span>
								)}
							</span>
						}
					/>
				)}
				<Row
					label="Monthly"
					icon={WalletIcon}
					value={formatCurrency(effectiveMonthly)}
				/>
				{customer.discount && customer.discount > 0 ? (
					<Row
						label="Discount"
						icon={GaugeIcon}
						value={`− ${formatCurrency(customer.discount)}`}
					/>
				) : null}
				{customer.balance != null && (
					<Row
						label="Balance"
						icon={WalletIcon}
						value={
							<span
								className={cn(
									customer.balance < 0 && "text-destructive",
								)}
							>
								{formatCurrency(customer.balance)}
							</span>
						}
					/>
				)}
				{customer.station?.name && (
					<Row
						label="Station"
						icon={RadioTowerIcon}
						value={
							<NetworkStatusValue
								name={customer.station.name}
								live={liveStation}
								kind="station"
							/>
						}
					/>
				)}
				{customer.accessPoint?.name && (
					<Row
						label="Access point"
						icon={WifiIcon}
						value={
							<NetworkStatusValue
								name={customer.accessPoint.name}
								live={liveAccessPoint}
								kind="accessPoint"
							/>
						}
					/>
				)}
				<Row
					label="Expires"
					icon={CalendarIcon}
					value={fmtDate(customer.expiresAt)}
				/>
				{customer.address && (
					<Row
						label="Address"
						icon={MapPinIcon}
						value={
							<span
								className="block max-w-[180px] truncate"
								title={customer.address}
							>
								{customer.address}
							</span>
						}
					/>
				)}
			</div>
		</div>
	);
}

export function ConversationContextPanel({
	conversation,
	organizationId,
	organizationSlug,
}: ConversationContextPanelProps) {
	if (!conversation) {
		return (
			<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
				Select a conversation to see context
			</div>
		);
	}

	const isAiFlagged = conversation.status === "needs_human";
	const contactInitials = getContactInitials(conversation.contactName);
	const contactAvatarColor = getAvatarColor(conversation.contactName);
	const linkedCustomers = conversation.customers;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			{isAiFlagged && (
				<div className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
					⚠ Flagged for human review
				</div>
			)}

			<Section title="Contact">
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm",
							contactAvatarColor,
						)}
						aria-hidden
					>
						{contactInitials}
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium">
							{conversation.contactName ?? "Anonymous"}
						</div>
						<div className="truncate font-mono text-[11px] text-muted-foreground">
							{conversation.externalChatId}
						</div>
					</div>
				</div>
			</Section>

			{linkedCustomers.length > 0 && (
				<Section
					title={
						linkedCustomers.length > 1
							? `Linked customers · ${linkedCustomers.length}`
							: "Linked customer"
					}
				>
					<div className="space-y-3">
						{linkedCustomers.map((c) => (
							<CustomerCardContainer
								key={c.id}
								customerId={c.id}
								organizationId={organizationId}
								organizationSlug={organizationSlug}
							/>
						))}
					</div>
				</Section>
			)}

			<Section title="Agent">
				<Row
					label="Name"
					icon={BotIcon}
					value={conversation.agent.name}
				/>
				{conversation.channel && (
					<>
						<Row
							label="Channel"
							value={
								<Badge
									variant="outline"
									className="text-[10px] capitalize"
								>
									{conversation.channel.provider}
								</Badge>
							}
						/>
						<Row
							label="Channel name"
							value={conversation.channel.name}
						/>
					</>
				)}
			</Section>

			<Section title="Stats">
				<Row
					label="Messages"
					icon={MessageSquareIcon}
					value={
						<span className="tabular-nums">
							{conversation.messageCount}
						</span>
					}
				/>
				<Row
					label="Last message"
					value={fmtRelative(conversation.lastMessageAt)}
				/>
				<Row
					label="Created"
					icon={CalendarIcon}
					value={fmtRelative(conversation.createdAt)}
				/>
				<Row
					label="Status"
					value={
						<Badge
							variant="outline"
							className="text-[10px] capitalize"
						>
							{conversation.status.replace("_", " ")}
						</Badge>
					}
				/>
			</Section>
		</div>
	);
}
