"use client";

import { formatDate, formatDateTime } from "@shared/lib/format";
import { Badge } from "@ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";

interface ConnectivityCellProps {
	status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
	online: boolean;
	lastLogin: Date | string | null;
	/**
	 * Live `Customer.expiresAt` (what iRadius says now). When passed, an
	 * "Expired" badge follows the dot once the date is in the past.
	 */
	expiresAt?: Date | string | null;
}

function relativeTimeShort(d: Date | string | null): string | null {
	if (!d) {
		return null;
	}
	const date = typeof d === "string" ? new Date(d) : d;
	const diff = Date.now() - date.getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) {
		return "now";
	}
	if (mins < 60) {
		return `${mins}m`;
	}
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) {
		return `${hrs}h`;
	}
	const days = Math.floor(hrs / 24);
	if (days < 30) {
		return `${days}d`;
	}
	const mos = Math.floor(days / 30);
	return `${mos}mo`;
}

export function ConnectivityCell({
	status,
	online,
	lastLogin,
	expiresAt,
}: ConnectivityCellProps) {
	const isActive = status === "ACTIVE";
	const tone = !isActive ? "inactive" : online ? "online" : "offline";

	const dotColor = {
		online: "bg-success",
		offline: "bg-destructive/70",
		inactive: "bg-muted-foreground/40",
	}[tone];

	const label = {
		online: "Online",
		offline: "Offline",
		inactive: status === "PENDING" ? "Pending" : "Inactive",
	}[tone];

	const seenAt = relativeTimeShort(lastLogin);
	const expired = expiresAt
		? new Date(expiresAt).getTime() < Date.now()
		: false;

	const dot = (
		<Tooltip>
			<TooltipTrigger asChild>
				{/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- <img> is a void element and cannot wrap these decorative dot spans; role="img"+aria-label labels the group as one image */}
				<span
					role="img"
					aria-label={label}
					className="inline-flex items-center justify-center"
				>
					<span className="relative inline-flex items-center justify-center">
						{tone === "online" && (
							<span className="absolute inline-flex size-3 animate-ping rounded-full bg-success/40" />
						)}
						<span
							className={cn(
								"relative size-2 rounded-full",
								dotColor,
							)}
						/>
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="top" className="text-xs">
				<div className="space-y-0.5">
					<div className="font-medium">{label}</div>
					{lastLogin && (
						<div className="text-muted-foreground">
							{tone === "online"
								? `Connected ${seenAt} ago`
								: `Last seen ${seenAt} ago`}
						</div>
					)}
					{lastLogin && (
						<div className="text-[10px] text-muted-foreground/70">
							{formatDateTime(lastLogin)}
						</div>
					)}
					{expiresAt && (
						<div className="text-muted-foreground">
							{expired ? "Expired" : "Expires"}{" "}
							{formatDate(expiresAt)}
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);

	if (!expired) {
		return dot;
	}
	return (
		<span className="inline-flex items-center gap-1.5">
			{dot}
			<Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
				Expired
			</Badge>
		</span>
	);
}
