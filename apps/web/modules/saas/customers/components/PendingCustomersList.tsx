"use client";

import { ContentCard } from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { PageShell } from "@shared/components/PageShell";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/components/dialog";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import { Textarea } from "@ui/components/textarea";
import {
	CheckIcon,
	MapPinIcon,
	PencilIcon,
	PhoneIcon,
	UserPlusIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	useApproveSetupRequest,
	useRejectSetupRequest,
	useSetupRequests,
} from "../hooks/use-setup-requests";
import { EditSetupRequestDialog } from "./EditSetupRequestDialog";

type SetupRequest = ReturnType<typeof useSetupRequests>["requests"][number];
type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

const STATUS_BADGES: Record<
	RequestStatus,
	{ label: string; variant: "info" | "success" | "error" }
> = {
	PENDING: { label: "Pending", variant: "info" },
	APPROVED: { label: "Approved", variant: "success" },
	REJECTED: { label: "Rejected", variant: "error" },
};

export function PendingCustomersList() {
	const organizationId = useOrganizationId();
	const [status, setStatus] = useState<RequestStatus>("PENDING");
	const { requests } = useSetupRequests(status);
	const approve = useApproveSetupRequest();
	const reject = useRejectSetupRequest();
	const [rejecting, setRejecting] = useState<SetupRequest | null>(null);
	const [rejectReason, setRejectReason] = useState("");
	const [editing, setEditing] = useState<SetupRequest | null>(null);

	return (
		<PageShell
			title="New Customers"
			description="Customers created by field workers, waiting for approval. Approving activates the account and records the first payment."
		>
			<Tabs
				value={status}
				onValueChange={(v) => setStatus(v as RequestStatus)}
				className="mb-4"
			>
				<TabsList>
					<TabsTrigger value="PENDING">Pending</TabsTrigger>
					<TabsTrigger value="APPROVED">Approved</TabsTrigger>
					<TabsTrigger value="REJECTED">Rejected</TabsTrigger>
				</TabsList>
			</Tabs>

			{requests.length === 0 ? (
				<ContentCard>
					<EmptyState
						icon={UserPlusIcon}
						title={`No ${status.toLowerCase()} requests`}
						description="Worker-created customers will appear here."
					/>
				</ContentCard>
			) : (
				<div className="space-y-3">
					{requests.map((request) => {
						const customer = request.customer;
						const name =
							displayName(
								customer.firstName,
								customer.lastName,
							) || customer.accountNumber;
						const itemsTotal = request.installations.reduce(
							(sum, i) => sum + i.price * i.quantity,
							0,
						);
						const badge = STATUS_BADGES[request.status];
						return (
							<Card key={request.id}>
								<CardContent className="p-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<p className="font-medium">
													{name}
												</p>
												<Badge variant={badge.variant}>
													{badge.label}
												</Badge>
											</div>
											<div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
												{customer.mobile && (
													<p className="flex items-center gap-1">
														<PhoneIcon className="size-3" />
														{customer.mobile}
													</p>
												)}
												{customer.address && (
													<p className="flex items-center gap-1">
														<MapPinIcon className="size-3" />
														{customer.address}
													</p>
												)}
												<p>
													Created by{" "}
													<span className="font-medium text-foreground">
														{
															request.requestedBy
																.name
														}
													</span>{" "}
													on{" "}
													{formatDate(
														request.createdAt,
														{
															dateStyle: "medium",
														},
													)}
												</p>
											</div>
										</div>
										<div className="text-right text-sm">
											<p>
												{customer.plan?.name ?? "—"}{" "}
												<span className="text-xs text-muted-foreground">
													(
													{request.durationType ===
													"month"
														? "1 month"
														: `${request.durationDays} days`}
													)
												</span>
											</p>
											<p className="font-mono font-medium tabular-nums">
												{formatCurrency(
													request.firstChargeAmount +
														itemsTotal,
												)}
											</p>
											<p className="text-xs text-muted-foreground">
												{formatCurrency(
													request.firstChargeAmount,
												)}{" "}
												plan
												{itemsTotal > 0 &&
													` + ${formatCurrency(itemsTotal)} items`}
											</p>
										</div>
									</div>

									{request.installations.length > 0 && (
										<div className="mt-3 space-y-1 rounded-md bg-muted/40 p-3">
											{request.installations.map(
												(inst) => (
													<div
														key={inst.id}
														className="flex items-center justify-between text-sm"
													>
														<span>
															{inst.stockItem
																?.name ??
																inst.notes ??
																"Item"}
															{inst.quantity >
																1 &&
																` ×${inst.quantity}`}
															{inst.isAddOn && (
																<span className="ml-1.5 text-xs text-muted-foreground">
																	(add-on)
																</span>
															)}
														</span>
														<span className="font-mono text-xs tabular-nums">
															{formatCurrency(
																inst.price *
																	inst.quantity,
															)}
														</span>
													</div>
												),
											)}
										</div>
									)}

									{request.status === "PENDING" && (
										<div className="mt-3 flex justify-end gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setEditing(request)
												}
											>
												<PencilIcon className="mr-1 size-3.5" />
												Edit
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													setRejectReason("");
													setRejecting(request);
												}}
											>
												<XIcon className="mr-1 size-3.5" />
												Reject
											</Button>
											<Button
												size="sm"
												disabled={
													approve.isPending ||
													!request.customer.username?.trim()
												}
												title={
													request.customer.username?.trim()
														? undefined
														: "Set a username (Edit) before approving"
												}
												onClick={async () => {
													if (!organizationId) {
														return;
													}
													try {
														await approve.mutateAsync(
															{
																organizationId,
																id: request.id,
															},
														);
														toast.success(
															"Customer approved and activated",
														);
													} catch (error) {
														toast.error(
															error instanceof
																Error
																? error.message
																: "Approval failed",
														);
													}
												}}
											>
												<CheckIcon className="mr-1 size-3.5" />
												Approve & activate
											</Button>
										</div>
									)}
									{request.status === "REJECTED" &&
										request.rejectedReason && (
											<p className="mt-2 text-xs text-destructive">
												Reason: {request.rejectedReason}
											</p>
										)}
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			{editing && (
				<EditSetupRequestDialog
					request={editing}
					onClose={() => setEditing(null)}
				/>
			)}

			{rejecting && (
				<Dialog
					open={!!rejecting}
					onOpenChange={(open) => {
						if (!open) {
							setRejecting(null);
						}
					}}
				>
					<DialogContent className="sm:max-w-sm">
						<DialogHeader>
							<DialogTitle>Reject New Customer</DialogTitle>
						</DialogHeader>
						<p className="text-sm text-muted-foreground">
							The customer record will be kept as inactive and all
							pending installations denied.
						</p>
						<Textarea
							value={rejectReason}
							onChange={(e) => setRejectReason(e.target.value)}
							placeholder="Reason (optional)"
							rows={3}
						/>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setRejecting(null)}
							>
								Cancel
							</Button>
							<Button
								variant="destructive"
								disabled={reject.isPending}
								onClick={async () => {
									if (!organizationId) {
										return;
									}
									try {
										await reject.mutateAsync({
											organizationId,
											id: rejecting.id,
											reason: rejectReason || undefined,
										});
										toast.success("Request rejected");
										setRejecting(null);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Failed to reject",
										);
									}
								}}
							>
								Reject
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</PageShell>
	);
}
