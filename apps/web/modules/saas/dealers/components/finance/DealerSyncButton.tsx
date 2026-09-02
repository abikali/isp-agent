"use client";

import { useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { cn } from "@ui/lib";
import { RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	useDealerFinanceSyncStatus,
	useSyncDealerFinance,
} from "../../hooks/use-dealer-finance";
import { relativeDays } from "../../lib/finance-labels";

interface DealerSyncButtonProps {
	lastSyncedAt: Date | string | null;
	/** A sync already queued/running when the page loaded. */
	runningOperationId: string | null;
	canManage: boolean;
}

/**
 * "Pull from iRadius now." Shows how fresh the numbers are, spins while the
 * worker runs, and refreshes the page once it finishes — no reload needed.
 */
export function DealerSyncButton({
	lastSyncedAt,
	runningOperationId,
	canManage,
}: DealerSyncButtonProps) {
	const organizationId = useOrganizationId();
	const queryClient = useQueryClient();
	const sync = useSyncDealerFinance();
	const [operationId, setOperationId] = useState<string | null>(
		runningOperationId,
	);
	const { data } = useDealerFinanceSyncStatus(operationId);
	const settledRef = useRef<string | null>(null);

	const status = data?.operation?.status;
	const running =
		sync.isPending || status === "pending" || status === "in_progress";

	useEffect(() => {
		const op = data?.operation;
		if (!op || settledRef.current === op.id) {
			return;
		}
		if (op.status === "completed" || op.status === "failed") {
			settledRef.current = op.id;
			queryClient.invalidateQueries({ queryKey: orpc.dealers.key() });
			if (op.status === "completed") {
				toast.success("Dealers are up to date with iRadius.");
			} else {
				toast.error("The sync failed. The numbers shown may be stale.");
			}
		}
	}, [data?.operation, queryClient]);

	const freshness = lastSyncedAt
		? `Synced ${relativeDays(lastSyncedAt)}`
		: "Never synced";

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={!canManage || !organizationId || running}
			title={
				canManage
					? "Pull the latest dealers and ledgers from iRadius"
					: freshness
			}
			onClick={async () => {
				if (!organizationId) {
					return;
				}
				try {
					const result = await sync.mutateAsync({ organizationId });
					setOperationId(result.operationId);
					settledRef.current = null;
				} catch (error) {
					toast.error(
						error instanceof Error
							? error.message
							: "Could not start the sync",
					);
				}
			}}
		>
			<RefreshCwIcon
				className={cn("size-3.5", running && "animate-spin")}
			/>
			{running ? "Syncing…" : freshness}
		</Button>
	);
}
