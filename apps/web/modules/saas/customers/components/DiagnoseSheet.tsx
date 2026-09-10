"use client";

import { formatDateTime } from "@shared/lib/format";
import { disabledQuery } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import { ActivityIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

/**
 * The live iRadius report the Telegram bot gives, inside the app. Sections
 * mirror the bot's output; values are rendered generically because the ISP
 * API returns mixed types for the same field.
 */
const SECTIONS: Array<{ title: string; keys: string[] }> = [
	{
		title: "User",
		keys: ["userName", "firstName", "lastName", "address", "creationDate"],
	},
	{
		title: "Account",
		keys: [
			"online",
			"active",
			"blocked",
			"archived",
			"accountTypeName",
			"expiryAccount",
			"activatedAccount",
			"fupMode",
			"lastLogin",
			"lastLogOut",
		],
	},
	{
		title: "Network",
		keys: [
			"ipAddress",
			"mikrotikInterface",
			"routerBrand",
			"basicSpeedDown",
			"basicSpeedUp",
			"dailyQuota",
			"monthlyQuota",
			"userUpTime",
		],
	},
	{
		title: "Station",
		keys: [
			"stationOnline",
			"stationName",
			"stationIpAddress",
			"stationUpTime",
		],
	},
	{
		title: "Access point",
		keys: [
			"accessPointOnline",
			"accessPointName",
			"accessPointBoardName",
			"accessPointIpAddress",
			"accessPointUpTime",
			"accessPointSignal",
		],
	},
];

const ONLINE_KEYS = new Set([
	"online",
	"active",
	"stationOnline",
	"accessPointOnline",
]);

function labelOf(key: string): string {
	return key
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.replace(/\bIp\b/, "IP")
		.replace(/Fup/, "FUP");
}

function isDateLike(key: string, value: unknown): value is string {
	return (
		typeof value === "string" &&
		/(date|login|logout|account)$/i.test(key) &&
		!Number.isNaN(new Date(value).getTime())
	);
}

function ValueCell({ k, value }: { k: string; value: unknown }) {
	if (value === null || value === undefined || value === "") {
		return <span className="text-muted-foreground">—</span>;
	}
	if (ONLINE_KEYS.has(k)) {
		const on = value === true || value === "true" || value === 1;
		return (
			<Badge variant={on ? "success" : "destructive"}>
				{on ? "Online" : "Offline"}
			</Badge>
		);
	}
	if (typeof value === "boolean") {
		return <span>{value ? "Yes" : "No"}</span>;
	}
	if (isDateLike(k, value)) {
		return <span>{formatDateTime(value)}</span>;
	}
	if (typeof value === "object") {
		return (
			<code className="break-all text-xs">{JSON.stringify(value)}</code>
		);
	}
	return <span className="break-all">{String(value)}</span>;
}

function Section({
	title,
	rows,
}: {
	title: string;
	rows: Array<[string, unknown]>;
}) {
	if (rows.length === 0) {
		return null;
	}
	return (
		<div>
			<h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
				{title}
			</h4>
			<dl className="divide-y divide-border rounded-md border border-border text-sm">
				{rows.map(([k, v]) => (
					<div
						key={k}
						className="flex items-start justify-between gap-3 px-3 py-1.5"
					>
						<dt className="shrink-0 text-muted-foreground">
							{labelOf(k)}
						</dt>
						<dd className="text-right font-medium">
							<ValueCell k={k} value={v} />
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

export function DiagnoseSheet({
	organizationId,
	customerId,
	customerName,
	open,
	onOpenChange,
}: {
	organizationId: string;
	customerId: string;
	customerName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const query = useQuery(
		open
			? {
					...orpc.customers.diagnose.queryOptions({
						input: { organizationId, customerId },
					}),
					staleTime: 30_000,
					retry: false,
				}
			: disabledQuery(["customers", "diagnose", customerId]),
	);
	const report = (query.data?.report ?? {}) as Record<string, unknown>;
	const peers = Array.isArray(report["accessPointUsers"])
		? (report["accessPointUsers"] as Array<{
				userName?: string;
				online?: unknown;
			}>)
		: [];
	const sessions = Array.isArray(report["userSessions"])
		? (report["userSessions"] as Array<Record<string, unknown>>)
		: [];
	const ping = query.data?.ping;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-lg"
			>
				<SheetHeader>
					<SheetTitle>Diagnose — {customerName}</SheetTitle>
					<SheetDescription>
						Live from iRadius
						{query.data?.connectionType
							? ` · ${query.data.connectionType}`
							: ""}
						{query.data?.fetchedAt
							? ` · ${formatDateTime(query.data.fetchedAt)}`
							: ""}
					</SheetDescription>
				</SheetHeader>
				<div className="mt-4 space-y-4">
					<Button
						variant="outline"
						size="sm"
						onClick={() => query.refetch()}
						disabled={query.isFetching}
					>
						<RefreshCwIcon
							className={cn(
								"mr-2 size-4",
								query.isFetching && "animate-spin",
							)}
						/>
						Refresh
					</Button>
					{query.isLoading && (
						<div className="space-y-2">
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-40 w-full" />
						</div>
					)}
					{query.error && (
						<p className="text-sm text-destructive">
							{query.error instanceof Error
								? query.error.message
								: "Could not reach iRadius"}
						</p>
					)}
					{query.data && (
						<>
							{SECTIONS.map((section) => (
								<Section
									key={section.title}
									title={section.title}
									rows={section.keys
										.filter((k) => k in report)
										.map((k) => [k, report[k]])}
								/>
							))}
							{peers.length > 0 && (
								<div>
									<h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
										Peers on this access point
									</h4>
									<div className="flex flex-wrap gap-1.5">
										{peers.map((peer) => (
											<Badge
												key={peer.userName}
												variant={
													peer.online === true ||
													peer.online === "true"
														? "success"
														: "outline"
												}
											>
												{peer.userName}
											</Badge>
										))}
									</div>
								</div>
							)}
							{sessions.length > 0 && (
								<Section
									title="Recent sessions"
									rows={sessions
										.slice(0, 5)
										.map((s, i) => [
											`session ${i + 1}`,
											`${String(s["startSession"] ?? "")} → ${String(s["endSession"] ?? "now")} (${String(s["sessionTime"] ?? "")})`,
										])}
								/>
							)}
							{ping !== null && ping !== undefined && (
								<div>
									<h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
										Ping
									</h4>
									<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-xs">
										{typeof ping === "string"
											? ping
											: JSON.stringify(ping, null, 2)}
									</pre>
								</div>
							)}
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- the trigger and its sheet ship together
export function DiagnoseButton({
	organizationId,
	customerId,
	customerName,
	className,
}: {
	organizationId: string;
	customerId: string;
	customerName: string;
	className?: string | undefined;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button
				variant="outline"
				size="sm"
				className={className}
				onClick={() => setOpen(true)}
			>
				<ActivityIcon className="mr-1.5 size-4" />
				Diagnose
			</Button>
			<DiagnoseSheet
				organizationId={organizationId}
				customerId={customerId}
				customerName={customerName}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
}
