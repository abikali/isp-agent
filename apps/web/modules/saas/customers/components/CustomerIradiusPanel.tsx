"use client";

import { formatBytes } from "@shared/components/charts/chart-utils";
import { formatDateTime } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import { cn } from "@ui/lib";
import { CircleIcon, ServerIcon, SignalIcon, WifiIcon } from "lucide-react";

interface CustomerIradiusPanelProps {
	online: boolean;
	username: string | null;
	ipAddress: string | null;
	macAddress: string | null;
	nasHost: string | null;
	lastLogin: Date | string | null;
	expiresAt: Date | string | null;
	downloadBytes: bigint | number | null;
	uploadBytes: bigint | number | null;
	dailyDownloadBytes: bigint | number | null;
	dailyUploadBytes: bigint | number | null;
	fupMode: string | null;
}

function toNumber(v: bigint | number | null): number {
	if (v == null) {
		return 0;
	}
	return typeof v === "bigint" ? Number(v) : v;
}

function Stat({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="space-y-0.5">
			<div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="text-sm font-medium tabular-nums">{value}</div>
			{hint && (
				<div className="text-xs text-muted-foreground">{hint}</div>
			)}
		</div>
	);
}

export function CustomerIradiusPanel({
	online,
	username,
	ipAddress,
	macAddress,
	nasHost,
	lastLogin,
	expiresAt,
	downloadBytes,
	uploadBytes,
	dailyDownloadBytes,
	dailyUploadBytes,
	fupMode,
}: CustomerIradiusPanelProps) {
	const dl = toNumber(downloadBytes);
	const ul = toNumber(uploadBytes);
	const dailyDl = toNumber(dailyDownloadBytes);
	const dailyUl = toNumber(dailyUploadBytes);

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle/40 px-3 py-2">
				<CircleIcon
					className={cn(
						"size-2.5 shrink-0 fill-current",
						online
							? "text-success animate-pulse"
							: "text-muted-foreground/40",
					)}
				/>
				<div className="flex-1">
					<div className="text-sm font-medium">
						{online ? "Online" : "Offline"}
					</div>
					{lastLogin && (
						<div className="text-xs text-muted-foreground">
							{online ? "Connected" : "Last seen"}{" "}
							{formatDateTime(lastLogin)}
						</div>
					)}
				</div>
				{fupMode && fupMode.toLowerCase() !== "normal" && (
					<Badge variant="outline" className="text-[10px]">
						{fupMode}
					</Badge>
				)}
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<Stat label="Username" value={username ?? "—"} />
				<Stat label="IP address" value={ipAddress ?? "—"} />
				<Stat label="MAC address" value={macAddress ?? "—"} />
				<Stat label="NAS host" value={nasHost ?? "—"} />
				<Stat
					label="Expires"
					value={expiresAt ? formatDateTime(expiresAt) : "—"}
				/>
				<Stat
					label="Last login"
					value={lastLogin ? formatDateTime(lastLogin) : "—"}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className="rounded-md border border-border p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						<WifiIcon className="size-3" />
						Daily ↓
					</div>
					<div className="mt-1 text-base font-medium tabular-nums">
						{formatBytes(dailyDl)}
					</div>
				</div>
				<div className="rounded-md border border-border p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						<SignalIcon className="size-3" />
						Daily ↑
					</div>
					<div className="mt-1 text-base font-medium tabular-nums">
						{formatBytes(dailyUl)}
					</div>
				</div>
				<div className="rounded-md border border-border p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						<ServerIcon className="size-3" />
						Total ↓
					</div>
					<div className="mt-1 text-base font-medium tabular-nums">
						{formatBytes(dl)}
					</div>
				</div>
				<div className="rounded-md border border-border p-3">
					<div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
						<ServerIcon className="size-3" />
						Total ↑
					</div>
					<div className="mt-1 text-base font-medium tabular-nums">
						{formatBytes(ul)}
					</div>
				</div>
			</div>
		</div>
	);
}
