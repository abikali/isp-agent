"use client";

import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { formatBytes, formatCurrency, formatDate } from "@shared/lib/format";
import {
	ActivityIcon,
	CalendarClockIcon,
	GaugeIcon,
	WalletIcon,
	WifiIcon,
	WifiOffIcon,
	ZapIcon,
} from "lucide-react";

interface CustomerLiveStripProps {
	online: boolean;
	lastLogin: Date | string | null;
	plan: { name: string; downloadSpeed: number; uploadSpeed: number } | null;
	expiresAt: Date | string | null;
	balance: number;
	monthlyRate: number | null;
	planMonthlyPrice: number | null;
	dailyDownloadBytes: bigint | number | null;
	dailyUploadBytes: bigint | number | null;
}

function toNumber(v: bigint | number | null | undefined): number {
	if (v == null) {
		return 0;
	}
	return typeof v === "bigint" ? Number(v) : v;
}

function relativeFromNow(value: Date | string | null): {
	label: string;
	tone: "default" | "warning" | "danger";
} {
	if (!value) {
		return { label: "—", tone: "default" };
	}
	const target = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(target.getTime())) {
		return { label: "—", tone: "default" };
	}
	const diffMs = target.getTime() - Date.now();
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
	if (diffDays < 0) {
		return {
			label: `${Math.abs(diffDays)}d overdue`,
			tone: "danger",
		};
	}
	if (diffDays === 0) {
		return { label: "Today", tone: "warning" };
	}
	if (diffDays <= 7) {
		return { label: `${diffDays}d left`, tone: "warning" };
	}
	return { label: `${diffDays}d left`, tone: "default" };
}

function relativeAgo(value: Date | string | null): string | null {
	if (!value) {
		return null;
	}
	const t = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(t.getTime())) {
		return null;
	}
	const diffMin = Math.round((Date.now() - t.getTime()) / 60000);
	if (diffMin < 1) {
		return "just now";
	}
	if (diffMin < 60) {
		return `${diffMin}m ago`;
	}
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) {
		return `${diffHr}h ago`;
	}
	const diffDay = Math.round(diffHr / 24);
	return `${diffDay}d ago`;
}

/**
 * Always-visible status hero above the customer detail tabs. Six metric cards
 * answering "is this customer OK right now?" without making the operator
 * click into a tab.
 */
export function CustomerLiveStrip({
	online,
	lastLogin,
	plan,
	expiresAt,
	balance,
	monthlyRate,
	planMonthlyPrice,
	dailyDownloadBytes,
	dailyUploadBytes,
}: CustomerLiveStripProps) {
	const expiry = relativeFromNow(expiresAt);
	const lastSeen = relativeAgo(lastLogin);
	const rate = monthlyRate ?? planMonthlyPrice ?? 0;
	const dl = toNumber(dailyDownloadBytes);
	const ul = toNumber(dailyUploadBytes);

	const speedLabel = plan
		? `${plan.downloadSpeed}/${plan.uploadSpeed} Mbps`
		: undefined;

	return (
		<MetricStrip columns={6}>
			<MetricCard
				label="Connection"
				value={online ? "Online" : "Offline"}
				icon={online ? WifiIcon : WifiOffIcon}
				tone={online ? "success" : "default"}
				hint={
					online
						? lastSeen
							? `Connected ${lastSeen}`
							: "Connected"
						: lastSeen
							? `Last seen ${lastSeen}`
							: "No recent session"
				}
			/>
			<MetricCard
				label="Plan"
				value={plan?.name ?? "—"}
				icon={ZapIcon}
				tone="info"
				hint={speedLabel}
			/>
			<MetricCard
				label="Expires"
				value={expiry.label}
				icon={CalendarClockIcon}
				tone={expiry.tone === "default" ? "default" : expiry.tone}
				hint={expiresAt ? formatDate(expiresAt) : undefined}
			/>
			<MetricCard
				label="Balance"
				value={formatCurrency(balance)}
				icon={WalletIcon}
				tone={
					balance > 0 ? "danger" : balance < 0 ? "success" : "default"
				}
				hint={balance > 0 ? "Owes" : balance < 0 ? "Credit" : "Settled"}
			/>
			<MetricCard
				label="Monthly rate"
				value={formatCurrency(rate)}
				icon={GaugeIcon}
				tone="default"
				hint={
					monthlyRate != null && monthlyRate !== planMonthlyPrice
						? "Custom rate"
						: "Plan rate"
				}
			/>
			<MetricCard
				label="Today"
				value={formatBytes(dl + ul)}
				icon={ActivityIcon}
				tone="default"
				hint={`↓ ${formatBytes(dl)}  ↑ ${formatBytes(ul)}`}
			/>
		</MetricStrip>
	);
}
