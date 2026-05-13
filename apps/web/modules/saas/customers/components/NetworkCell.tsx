"use client";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

interface NetworkCellProps {
	ipAddress: string | null;
	macAddress: string | null;
	nasHost: string | null;
}

function CopyValue({ value, label }: { value: string; label: string }) {
	const [copied, setCopied] = useState(false);
	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	};
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleCopy}
					className="group/copy inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
				>
					<span className="truncate">{value}</span>
					{copied ? (
						<CheckIcon className="size-2.5 text-success" />
					) : (
						<CopyIcon className="size-2.5 opacity-0 transition-opacity group-hover/copy:opacity-100" />
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent>
				{copied ? "Copied!" : `Copy ${label}`}
			</TooltipContent>
		</Tooltip>
	);
}

export function NetworkCell({
	ipAddress,
	macAddress,
	nasHost,
}: NetworkCellProps) {
	if (!ipAddress && !macAddress) {
		return <span className="text-muted-foreground">—</span>;
	}

	return (
		<div className="flex min-w-0 flex-col gap-0.5 leading-tight">
			{ipAddress && <CopyValue value={ipAddress} label="IP" />}
			{macAddress && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="truncate font-mono text-[10px] text-muted-foreground/70">
							{macAddress}
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<div className="space-y-0.5 text-xs">
							<div>
								<span className="text-muted-foreground">
									MAC:
								</span>{" "}
								<span className="font-mono">{macAddress}</span>
							</div>
							{nasHost && (
								<div>
									<span className="text-muted-foreground">
										NAS:
									</span>{" "}
									<span className="font-mono">{nasHost}</span>
								</div>
							)}
						</div>
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
}
