"use client";

import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Input } from "@ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { useState } from "react";
import { toast } from "sonner";
import {
	useApproveStockRefund,
	useRejectStockRefund,
	useStockRefundRequests,
} from "../hooks/use-stock";

type RefundStatus = "PENDING" | "APPROVED" | "REJECTED";
type RefundRequest = ReturnType<
	typeof useStockRefundRequests
>["requests"][number];

const STATUS_VARIANTS: Record<RefundStatus, "info" | "success" | "error"> = {
	PENDING: "info",
	APPROVED: "success",
	REJECTED: "error",
};

export function RefundRequestsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [status, setStatus] = useState<RefundStatus>("PENDING");
	const { requests, isLoading } = useStockRefundRequests({ status });

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Stock Refund Requests</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<Select
						value={status}
						onValueChange={(v) => setStatus(v as RefundStatus)}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="PENDING">Pending</SelectItem>
							<SelectItem value="APPROVED">Approved</SelectItem>
							<SelectItem value="REJECTED">Rejected</SelectItem>
						</SelectContent>
					</Select>

					{isLoading ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							Loading…
						</p>
					) : requests.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							No {status.toLowerCase()} refund requests.
						</p>
					) : (
						<div className="max-h-[60vh] space-y-2 overflow-y-auto">
							{requests.map((request) => (
								<RefundRequestRow
									key={request.id}
									request={request}
								/>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- request row colocated with its review list
function RefundRequestRow({ request }: { request: RefundRequest }) {
	const organizationId = useOrganizationId();
	const approve = useApproveStockRefund();
	const reject = useRejectStockRefund();
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");

	const busy = approve.isPending || reject.isPending;

	async function handleApprove() {
		if (!organizationId) {
			return;
		}
		try {
			await approve.mutateAsync({ organizationId, id: request.id });
			toast.success("Refund approved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to approve",
			);
		}
	}

	async function handleReject() {
		if (!organizationId) {
			return;
		}
		try {
			await reject.mutateAsync({
				organizationId,
				id: request.id,
				...(reason.trim() ? { reason: reason.trim() } : {}),
			});
			toast.success("Refund rejected");
			setRejecting(false);
			setReason("");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to reject",
			);
		}
	}

	return (
		<div className="rounded-md border p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-medium text-sm">
						{request.stockItem.name}
					</p>
					<p className="text-muted-foreground text-xs">
						{request.employee.name} · ×{request.quantity} ·{" "}
						{formatCurrency(request.quantity * request.unitPrice)}
					</p>
					<p className="text-muted-foreground text-[11px]">
						{formatDate(request.createdAt, {
							day: "numeric",
							month: "short",
							year: "numeric",
						})}
					</p>
					{request.status === "REJECTED" && request.rejectedReason ? (
						<p className="text-destructive text-xs">
							{request.rejectedReason}
						</p>
					) : null}
				</div>
				<Badge variant={STATUS_VARIANTS[request.status]}>
					{request.status.charAt(0) +
						request.status.slice(1).toLowerCase()}
				</Badge>
			</div>

			{request.notes ? (
				<p className="mt-1.5 text-muted-foreground text-xs">
					“{request.notes}”
				</p>
			) : null}

			{request.status === "PENDING" ? (
				rejecting ? (
					<div className="mt-2 space-y-2">
						<Input
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="Reason (optional)"
						/>
						<div className="flex gap-2">
							<Button
								variant="destructive"
								size="sm"
								onClick={handleReject}
								disabled={busy}
							>
								Confirm reject
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setRejecting(false);
									setReason("");
								}}
								disabled={busy}
							>
								Cancel
							</Button>
						</div>
					</div>
				) : (
					<div className="mt-2 flex gap-2">
						<Button
							size="sm"
							onClick={handleApprove}
							disabled={busy}
						>
							Approve
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setRejecting(true)}
							disabled={busy}
						>
							Reject
						</Button>
					</div>
				)
			) : null}
		</div>
	);
}
