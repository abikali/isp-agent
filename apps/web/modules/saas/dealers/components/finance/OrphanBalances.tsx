"use client";

import { formatCurrency, formatDate } from "@shared/lib/format";
import { Button } from "@ui/components/button";
import { ChevronDownIcon, GhostIcon } from "lucide-react";
import { useState } from "react";
import type { DealerFinanceRow } from "../../hooks/use-dealer-finance";

interface OrphanBalancesProps {
	orphans: DealerFinanceRow[];
	total: number;
	canManage: boolean;
	onWriteOff: (dealer: DealerFinanceRow) => void;
}

/**
 * Money on dealers that no longer exist in iRadius. Real, usually
 * uncollectable, and previously invisible: the sync used to drop these rows
 * because there was no dealer to attach them to.
 */
export function OrphanBalances({
	orphans,
	total,
	canManage,
	onWriteOff,
}: OrphanBalancesProps) {
	const [open, setOpen] = useState(false);

	if (orphans.length === 0) {
		return null;
	}

	return (
		<div className="rounded-lg border border-dashed border-border">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left"
			>
				<GhostIcon className="size-4 text-muted-foreground" />
				<span className="flex-1 text-sm">
					<span className="font-medium">
						{formatCurrency(total)} on {orphans.length} deleted{" "}
						{orphans.length === 1 ? "dealer" : "dealers"}
					</span>
					<span className="ml-2 text-muted-foreground">
						Balances left behind when a dealer was removed from
						iRadius.
					</span>
				</span>
				<ChevronDownIcon
					className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<ul className="border-t border-border">
					{orphans.map((dealer) => (
						<li
							key={dealer.id}
							className="flex items-center gap-3 px-4 py-2.5 text-sm"
						>
							<div className="min-w-0 flex-1">
								<div className="font-medium">{dealer.name}</div>
								<div className="text-xs text-muted-foreground">
									Last entry{" "}
									{dealer.lastActivityAt
										? formatDate(dealer.lastActivityAt, {
												dateStyle: "medium",
											})
										: "unknown"}
								</div>
							</div>
							<span className="font-mono tabular-nums">
								{formatCurrency(dealer.owed)}
							</span>
							{canManage && dealer.owed > 0 && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => onWriteOff(dealer)}
								>
									Write off
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
