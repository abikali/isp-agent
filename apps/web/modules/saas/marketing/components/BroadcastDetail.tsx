"use client";

import type { SaltiTemplate } from "@repo/integrations";
import { ContentCard } from "@shared/components/ContentCard";
import { MetricCard, MetricStrip } from "@shared/components/MetricCard";
import { PageShell } from "@shared/components/PageShell";
import { formatDateTime } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@ui/components/alert-dialog";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/components/dropdown-menu";
import { Input } from "@ui/components/input";
import { Progress } from "@ui/components/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@ui/components/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ui/components/tooltip";
import { cn } from "@ui/lib";
import {
	CheckCircleIcon,
	ChevronDownIcon,
	CopyIcon,
	MoreHorizontalIcon,
	PauseIcon,
	PencilIcon,
	PercentIcon,
	RotateCcwIcon,
	SearchIcon,
	SendIcon,
	Trash2Icon,
	UsersIcon,
	XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	useBroadcast,
	useCancelBroadcast,
	useDeleteBroadcast,
	useResendBroadcast,
	useTemplatesQuery,
} from "../hooks/use-marketing";
import {
	BROADCAST_STATUS_VARIANTS,
	RECIPIENT_STATUS_VARIANTS,
} from "../lib/status-variants";
import { WhatsAppPreview } from "./WhatsAppPreview";

interface BroadcastDetailProps {
	broadcastId: string;
	organizationSlug: string;
}

const RECIPIENT_PAGE_SIZE = 50;

export function BroadcastDetail({
	broadcastId,
	organizationSlug,
}: BroadcastDetailProps) {
	const organizationId = useOrganizationId();
	const navigate = useNavigate();
	const [recipientStatus, setRecipientStatus] = useState<
		"all" | "queued" | "sent" | "failed"
	>("all");
	const [recipientSearch, setRecipientSearch] = useState("");
	const [recipientPage, setRecipientPage] = useState(1);
	const [debouncedSearch] = useDebouncedValue(recipientSearch, { wait: 250 });

	const {
		broadcast,
		creator,
		recipients,
		recipientTotal,
		recipientCounts,
		refetch,
	} = useBroadcast(broadcastId, {
		...(recipientStatus !== "all" && { recipientStatus }),
		recipientPage,
		...(debouncedSearch && { recipientSearch: debouncedSearch }),
	});
	const cancel = useCancelBroadcast();
	const resend = useResendBroadcast();
	const remove = useDeleteBroadcast();
	const [confirmDelete, setConfirmDelete] = useState(false);

	// Templates list — used to resolve the source template for the preview.
	// May be unavailable (e.g. Salti integration broken) so we fall back to
	// a name-only display.
	const { templates } = useTemplatesQuery();

	const sourceTemplate: SaltiTemplate | undefined = useMemo(
		() =>
			templates.find(
				(t) =>
					broadcast &&
					t.name === broadcast.templateName &&
					t.language === broadcast.templateLang,
			),
		[templates, broadcast],
	);

	if (!broadcast) {
		return null;
	}

	const progress =
		broadcast.totalRecipients > 0
			? Math.round(
					((broadcast.sentCount + broadcast.failedCount) /
						broadcast.totalRecipients) *
						100,
				)
			: 0;

	const isInFlight =
		broadcast.status === "pending" || broadcast.status === "running";
	const isEditable = broadcast.status === "pending";
	const isDeletable = broadcast.status !== "running";

	const onCancel = async () => {
		if (!organizationId) {
			return;
		}
		try {
			await cancel.mutateAsync({ organizationId, broadcastId });
			await refetch();
			toast.success("Broadcast cancelled");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Cancel failed");
		}
	};

	const onResend = async (onlyFailed = false) => {
		if (!organizationId) {
			return;
		}
		try {
			const result = await resend.mutateAsync({
				organizationId,
				broadcastId,
				onlyFailedRecipients: onlyFailed,
			});
			toast.success(
				onlyFailed
					? "Failed recipients queued for retry"
					: "Broadcast queued",
			);
			await navigate({
				to: "/app/$organizationSlug/marketing/$broadcastId",
				params: {
					organizationSlug,
					broadcastId: result.broadcast.id,
				},
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Resend failed");
		}
	};

	const onDelete = async () => {
		if (!organizationId) {
			return;
		}
		try {
			await remove.mutateAsync({ organizationId, broadcastId });
			toast.success("Broadcast deleted");
			await navigate({
				to: "/app/$organizationSlug/marketing",
				params: { organizationSlug },
			});
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed");
		}
	};

	const deliveryRate =
		broadcast.totalRecipients > 0
			? Math.round(
					(broadcast.sentCount / broadcast.totalRecipients) * 100,
				)
			: 0;

	const audienceConfig = broadcast.audienceConfig as Record<string, unknown>;
	const recipientPageTotal = Math.max(
		1,
		Math.ceil(recipientTotal / RECIPIENT_PAGE_SIZE),
	);

	return (
		<PageShell
			title={broadcast.name}
			backTo={`/app/${organizationSlug}/marketing`}
			backLabel="Back to broadcasts"
			subtitle={
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
					<span>
						<span className="text-muted-foreground">Template:</span>{" "}
						<span className="font-medium">
							{broadcast.templateName}
						</span>{" "}
						<Badge
							variant="outline"
							className="ml-1 px-1.5 py-0 text-[10px] uppercase"
						>
							{broadcast.templateLang}
						</Badge>
					</span>
					{creator && (
						<span>
							<span className="text-muted-foreground">By:</span>{" "}
							{creator.name ?? creator.email}
						</span>
					)}
					<span>
						<span className="text-muted-foreground">Created:</span>{" "}
						{formatDateTime(broadcast.createdAt)}
					</span>
					{broadcast.startedAt && (
						<span>
							<span className="text-muted-foreground">
								Started:
							</span>{" "}
							{formatDateTime(broadcast.startedAt)}
						</span>
					)}
					{broadcast.completedAt && (
						<span>
							<span className="text-muted-foreground">
								Completed:
							</span>{" "}
							{formatDateTime(broadcast.completedAt)}
						</span>
					)}
				</div>
			}
			badges={
				<Badge
					variant={
						BROADCAST_STATUS_VARIANTS[broadcast.status] ?? "outline"
					}
				>
					{broadcast.status}
				</Badge>
			}
			actions={
				<div className="flex items-center gap-2">
					{isInFlight && (
						<Button
							variant="outline"
							onClick={onCancel}
							disabled={cancel.isPending}
						>
							<PauseIcon className="size-4" />
							{cancel.isPending ? "Cancelling…" : "Cancel"}
						</Button>
					)}
					{isEditable && (
						<Button asChild>
							<Link
								to="/app/$organizationSlug/marketing/$broadcastId/edit"
								params={{
									organizationSlug,
									broadcastId,
								}}
							>
								<PencilIcon className="size-4" />
								Edit
							</Link>
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">
								<MoreHorizontalIcon className="size-4" />
								More
								<ChevronDownIcon className="size-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => onResend(false)}
								disabled={resend.isPending}
							>
								<CopyIcon className="size-4" />
								Resend (clone &amp; rebuild)
							</DropdownMenuItem>
							{broadcast.failedCount > 0 && (
								<DropdownMenuItem
									onClick={() => onResend(true)}
									disabled={resend.isPending}
								>
									<RotateCcwIcon className="size-4" />
									Retry failed only
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => setConfirmDelete(true)}
								disabled={!isDeletable}
								className="text-destructive focus:text-destructive"
							>
								<Trash2Icon className="size-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			}
		>
			{/* Metrics */}
			<MetricStrip columns={5}>
				<MetricCard
					label="Recipients"
					value={broadcast.totalRecipients}
					icon={UsersIcon}
					tone="default"
				/>
				<MetricCard
					label="Sent"
					value={broadcast.sentCount}
					icon={CheckCircleIcon}
					tone="success"
				/>
				<MetricCard
					label="Failed"
					value={broadcast.failedCount}
					icon={XCircleIcon}
					tone={broadcast.failedCount > 0 ? "danger" : "default"}
				/>
				<MetricCard
					label="Queued"
					value={recipientCounts.queued}
					icon={SendIcon}
					tone="info"
				/>
				<MetricCard
					label="Delivery rate"
					value={`${deliveryRate}%`}
					icon={PercentIcon}
					tone={
						deliveryRate >= 90
							? "success"
							: deliveryRate >= 70
								? "warning"
								: "danger"
					}
				/>
			</MetricStrip>

			{/* Progress */}
			<ContentCard>
				<div className="space-y-2 p-4">
					<div className="flex items-center justify-between text-sm">
						<span className="font-medium">Progress</span>
						<span className="text-muted-foreground">
							{broadcast.sentCount + broadcast.failedCount} /{" "}
							{broadcast.totalRecipients} processed · {progress}%
						</span>
					</div>
					<Progress value={progress} />
				</div>
			</ContentCard>

			<div className="grid gap-6 lg:grid-cols-[1fr_360px]">
				<div className="min-w-0 space-y-4">
					{/* Audience config */}
					<ContentCard>
						<div className="border-b bg-surface-subtle/40 px-4 py-2.5 text-sm font-medium">
							Audience
						</div>
						<AudienceSummary
							audienceType={broadcast.audienceType}
							config={audienceConfig}
						/>
					</ContentCard>

					{/* Recipients */}
					<ContentCard>
						<div className="space-y-3 border-b bg-surface-subtle/40 p-3">
							<div className="flex items-center justify-between">
								<div className="text-sm font-medium">
									Recipients{" "}
									<span className="text-xs font-normal text-muted-foreground">
										({recipientTotal.toLocaleString()})
									</span>
								</div>
								<div className="relative">
									<SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={recipientSearch}
										onChange={(e) => {
											setRecipientSearch(e.target.value);
											setRecipientPage(1);
										}}
										placeholder="Search phone or name…"
										className="h-8 w-[200px] pl-8 sm:w-[280px]"
									/>
								</div>
							</div>
							<Tabs
								value={recipientStatus}
								onValueChange={(v) => {
									setRecipientStatus(v as never);
									setRecipientPage(1);
								}}
							>
								<TabsList className="grid w-full grid-cols-4 sm:w-fit sm:grid-cols-none sm:auto-cols-max sm:grid-flow-col">
									<TabsTrigger value="all">
										All ({broadcast.totalRecipients})
									</TabsTrigger>
									<TabsTrigger value="sent">
										Sent ({recipientCounts.sent})
									</TabsTrigger>
									<TabsTrigger value="queued">
										Queued ({recipientCounts.queued})
									</TabsTrigger>
									<TabsTrigger value="failed">
										Failed ({recipientCounts.failed})
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>

						{recipients.length === 0 ? (
							<div className="p-8 text-center text-sm text-muted-foreground">
								No recipients match this filter.
							</div>
						) : (
							<>
								<div className="hidden md:block">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Phone</TableHead>
												<TableHead>Name</TableHead>
												<TableHead>Status</TableHead>
												<TableHead>Sent at</TableHead>
												<TableHead>Error</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{recipients.map((r) => (
												<TableRow key={r.id}>
													<TableCell className="font-mono text-sm">
														{r.phone}
													</TableCell>
													<TableCell>
														{r.contactName ?? "—"}
													</TableCell>
													<TableCell>
														<Badge
															variant={
																RECIPIENT_STATUS_VARIANTS[
																	r.status
																] ?? "outline"
															}
														>
															{r.status}
														</Badge>
													</TableCell>
													<TableCell className="text-xs text-muted-foreground">
														{r.sentAt
															? formatDateTime(
																	r.sentAt,
																)
															: "—"}
													</TableCell>
													<TableCell className="max-w-xs text-sm text-destructive">
														{r.errorMessage ? (
															<Tooltip>
																<TooltipTrigger
																	asChild
																	className="cursor-help"
																>
																	<span className="block truncate">
																		{
																			r.errorMessage
																		}
																	</span>
																</TooltipTrigger>
																<TooltipContent className="max-w-md whitespace-pre-wrap break-words">
																	{
																		r.errorMessage
																	}
																</TooltipContent>
															</Tooltip>
														) : (
															""
														)}
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>

								<div className="space-y-2 p-3 md:hidden">
									{recipients.map((r) => (
										<div
											key={r.id}
											className="rounded-lg border bg-card p-3"
										>
											<div className="flex items-center justify-between gap-2">
												<span className="font-mono text-sm">
													{r.phone}
												</span>
												<Badge
													variant={
														RECIPIENT_STATUS_VARIANTS[
															r.status
														] ?? "outline"
													}
												>
													{r.status}
												</Badge>
											</div>
											{r.contactName && (
												<div className="mt-1 text-xs text-muted-foreground">
													{r.contactName}
												</div>
											)}
											{r.sentAt && (
												<div className="mt-1 text-[10px] text-muted-foreground">
													{formatDateTime(r.sentAt)}
												</div>
											)}
											{r.errorMessage && (
												<div className="mt-2 break-words text-xs text-destructive">
													{r.errorMessage}
												</div>
											)}
										</div>
									))}
								</div>

								{recipientPageTotal > 1 && (
									<div className="flex items-center justify-between border-t bg-surface-subtle/40 px-3 py-2.5 text-sm">
										<span className="text-muted-foreground">
											Showing{" "}
											{(recipientPage - 1) *
												RECIPIENT_PAGE_SIZE +
												1}
											–
											{Math.min(
												recipientPage *
													RECIPIENT_PAGE_SIZE,
												recipientTotal,
											)}{" "}
											of {recipientTotal}
										</span>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												disabled={recipientPage === 1}
												onClick={() =>
													setRecipientPage((p) =>
														Math.max(1, p - 1),
													)
												}
											>
												Previous
											</Button>
											<span className="text-xs text-muted-foreground">
												Page {recipientPage} of{" "}
												{recipientPageTotal}
											</span>
											<Button
												variant="outline"
												size="sm"
												disabled={
													recipientPage >=
													recipientPageTotal
												}
												onClick={() =>
													setRecipientPage((p) =>
														Math.min(
															recipientPageTotal,
															p + 1,
														),
													)
												}
											>
												Next
											</Button>
										</div>
									</div>
								)}
							</>
						)}
					</ContentCard>
				</div>

				<aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
					<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Message preview
					</div>
					<WhatsAppPreview
						template={sourceTemplate}
						headerMediaUrl={
							(
								broadcast.variables as {
									headerMedia?: { url?: string };
								}
							).headerMedia?.url
						}
					/>
					{!sourceTemplate && (
						<p className="text-xs text-muted-foreground">
							Template not found in Salti — only the static body
							stored at send-time is preserved.
						</p>
					)}
				</aside>
			</div>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete broadcast?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently removes "{broadcast.name}" and all{" "}
							{broadcast.totalRecipients.toLocaleString()}{" "}
							recipient records. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={onDelete}
							disabled={remove.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{remove.isPending ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageShell>
	);
}

function AudienceSummary({
	audienceType,
	config,
}: {
	audienceType: string;
	config: Record<string, unknown>;
}) {
	const rows: { label: string; value: string }[] = [];
	rows.push({ label: "Type", value: humanAudienceType(audienceType) });
	if (audienceType === "isp_customers") {
		const statuses = asArray(config["statuses"] ?? config["status"]);
		if (statuses.length > 0) {
			rows.push({ label: "Status", value: statuses.join(", ") });
		}
		const planIds = asArray(config["planIds"] ?? config["planId"]);
		if (planIds.length > 0) {
			rows.push({
				label: "Plans",
				value: `${planIds.length} selected`,
			});
		}
		const stationIds = asArray(config["stationIds"] ?? config["stationId"]);
		if (stationIds.length > 0) {
			rows.push({
				label: "Stations",
				value: `${stationIds.length} selected`,
			});
		}
		const collectorIds = asArray(
			config["collectorIds"] ?? config["collectorId"],
		);
		if (collectorIds.length > 0) {
			rows.push({
				label: "Collectors",
				value: `${collectorIds.length} selected`,
			});
		}
		const groupNames = asArray(config["groupNames"] ?? config["groupName"]);
		if (groupNames.length > 0) {
			rows.push({ label: "Groups", value: groupNames.join(", ") });
		}
		const connectionTypes = asArray(
			config["connectionTypes"] ?? config["connectionType"],
		);
		if (connectionTypes.length > 0) {
			rows.push({
				label: "Connection",
				value: connectionTypes.join(", "),
			});
		}
		if (typeof config["expiresWithinDays"] === "number") {
			rows.push({
				label: "Expires within",
				value: `${config["expiresWithinDays"]} days`,
			});
		}
		if (typeof config["minBalance"] === "number") {
			rows.push({
				label: "Min balance",
				value: String(config["minBalance"]),
			});
		}
	} else if (audienceType === "salti_group") {
		const groupNames = asArray(config["groupNames"]);
		const groupIds = asArray(config["groupIds"] ?? config["groupId"]);
		if (groupNames.length > 0) {
			rows.push({ label: "Groups", value: groupNames.join(", ") });
		} else if (groupIds.length > 0) {
			rows.push({
				label: "Groups",
				value: `${groupIds.length} selected`,
			});
		}
	} else if (audienceType === "csv") {
		const rowsArr = config["rows"];
		if (Array.isArray(rowsArr)) {
			rows.push({ label: "Rows", value: String(rowsArr.length) });
		}
	} else if (audienceType === "manual") {
		const phones = config["phones"];
		if (Array.isArray(phones)) {
			rows.push({ label: "Phones", value: String(phones.length) });
		}
	}
	if (rows.length === 1) {
		rows.push({ label: "Note", value: "No additional filters" });
	}
	return (
		<dl className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
			{rows.map((r) => (
				<div
					key={r.label}
					className="flex flex-col gap-0.5 rounded border bg-muted/20 p-2"
				>
					<dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
						{r.label}
					</dt>
					<dd className={cn("text-sm", "truncate")} title={r.value}>
						{r.value}
					</dd>
				</div>
			))}
		</dl>
	);
}

function humanAudienceType(t: string): string {
	if (t === "isp_customers") {
		return "ISP customers";
	}
	if (t === "salti_group") {
		return "Salti group";
	}
	if (t === "csv") {
		return "CSV upload";
	}
	if (t === "manual") {
		return "Manual list";
	}
	return t;
}

function asArray(v: unknown): string[] {
	if (Array.isArray(v)) {
		return v.map(String);
	}
	if (typeof v === "string" && v.length > 0) {
		return [v];
	}
	return [];
}

export function BroadcastDetailSkeleton() {
	return (
		<PageShell title="Broadcast">
			<div className="h-64 animate-pulse rounded-lg border bg-muted/20" />
		</PageShell>
	);
}
