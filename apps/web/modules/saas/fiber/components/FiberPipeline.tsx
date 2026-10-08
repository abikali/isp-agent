"use client";

import {
	FIBER_SOURCE_LABELS,
	FIBER_SOURCES,
	FIBER_STAGE_LABELS,
	FIBER_STAGES,
	type FiberSource,
	type FiberStage,
	OPEN_FIBER_STAGES,
} from "@repo/api/modules/fiber/lib/constants";
import { useEmployeesQuery } from "@saas/employees/client";
import { Pagination } from "@saas/shared/components/Pagination";
import { ContentCard } from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { SearchInput } from "@shared/components/SearchInput";
import { displayName } from "@shared/lib/display-name";
import { formatDate, formatDateTime } from "@shared/lib/format";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Button } from "@ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import { Skeleton } from "@ui/components/skeleton";
import { cn } from "@ui/lib";
import { AlarmClockIcon, CableIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { type FiberLeadRow, useFiberLeads } from "../hooks/use-fiber";
import { signalKind, signalText } from "../lib/signals";
import { FiberLeadSheet } from "./FiberLeadSheet";
import { StageBadge } from "./StageBadge";

export interface PipelineFilters {
	stage: FiberStage | "OPEN";
	overdue?: boolean;
	area?: string;
	source?: FiberSource;
	assigneeId?: string;
}

const PAGE_SIZE = 50;

interface FiberPipelineProps {
	organizationSlug: string;
	canManage: boolean;
	filters: PipelineFilters;
	onFiltersChange: (filters: PipelineFilters) => void;
	initialLeadId?: string | undefined;
}

export function FiberPipeline({
	organizationSlug,
	canManage,
	filters,
	onFiltersChange,
	initialLeadId,
}: FiberPipelineProps) {
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 250 });
	const [page, setPage] = useState(1);
	const [openLeadId, setOpenLeadId] = useState<string | null>(
		initialLeadId ?? null,
	);
	const { employees } = useEmployeesQuery();

	const query = useFiberLeads({
		...filters,
		page,
		pageSize: PAGE_SIZE,
		search: debouncedSearch.trim() || undefined,
	});
	const counts = query.data?.stageCounts ?? {};
	const openCount = OPEN_FIBER_STAGES.reduce(
		(s, st) => s + (counts[st] ?? 0),
		0,
	);
	const leads = query.data?.leads ?? [];
	const total = query.data?.total ?? 0;

	function update(next: Partial<PipelineFilters>) {
		setPage(1);
		onFiltersChange({ ...filters, ...next });
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				People who asked about fiber, or that the team added. Each row
				says why they are here — open one to read their message and
				record what happened.
			</p>
			{/* Stage tabs — counts ignore the stage itself so they always add up. */}
			<div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
				<StagePill
					label="All open"
					count={openCount}
					active={filters.stage === "OPEN"}
					onClick={() => update({ stage: "OPEN" })}
				/>
				{FIBER_STAGES.map((stage) => (
					<StagePill
						key={stage}
						label={FIBER_STAGE_LABELS[stage]}
						count={counts[stage] ?? 0}
						active={filters.stage === stage}
						tone={
							stage === "WON"
								? "success"
								: stage === "LOST"
									? "muted"
									: "default"
						}
						onClick={() => update({ stage })}
					/>
				))}
			</div>

			<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
				<SearchInput
					value={search}
					onChange={(v) => {
						setSearch(v);
						setPage(1);
					}}
					placeholder="Name, username or phone"
					className="sm:max-w-64"
				/>
				<Select
					value={filters.assigneeId ?? "all"}
					onValueChange={(v) =>
						update({ assigneeId: v === "all" ? undefined : v })
					}
				>
					<SelectTrigger className="sm:w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Anyone</SelectItem>
						<SelectItem value="none">Unassigned</SelectItem>
						{employees.map((e) => (
							<SelectItem key={e.id} value={e.id}>
								{e.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={filters.source ?? "all"}
					onValueChange={(v) =>
						update({
							source:
								v === "all" ? undefined : (v as FiberSource),
						})
					}
				>
					<SelectTrigger className="sm:w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Any source</SelectItem>
						{FIBER_SOURCES.map((s) => (
							<SelectItem key={s} value={s}>
								{FIBER_SOURCE_LABELS[s]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant={filters.overdue ? "primary" : "outline"}
					aria-pressed={!!filters.overdue}
					onClick={() => update({ overdue: !filters.overdue })}
				>
					<AlarmClockIcon />
					Overdue only
				</Button>
				{filters.area && (
					<Button
						variant="outline"
						onClick={() => update({ area: undefined })}
					>
						<span className="capitalize">{filters.area}</span> ✕
					</Button>
				)}
			</div>

			<ContentCard>
				{query.isLoading ? (
					<div className="space-y-2 p-4">
						{[0, 1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-14 w-full" />
						))}
					</div>
				) : leads.length === 0 ? (
					<EmptyState
						icon={CableIcon}
						title="No leads here"
						description="Leads appear by themselves when customers ask the bot about fiber or Ogero. You can also add one by hand or from the defend list."
						className="m-4"
					/>
				) : (
					<ul className="divide-y">
						{leads.map((lead) => (
							<LeadRow
								key={lead.id}
								lead={lead}
								onOpen={() => setOpenLeadId(lead.id)}
							/>
						))}
					</ul>
				)}
			</ContentCard>

			<Pagination
				totalItems={total}
				itemsPerPage={PAGE_SIZE}
				currentPage={page}
				onChangeCurrentPage={setPage}
			/>

			<FiberLeadSheet
				leadId={openLeadId}
				organizationSlug={organizationSlug}
				canManage={canManage}
				onClose={() => setOpenLeadId(null)}
			/>
		</div>
	);
}

function StagePill({
	label,
	count,
	active,
	tone = "default",
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	tone?: "default" | "success" | "muted";
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			className={cn(
				"flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
				active
					? "border-primary bg-primary text-primary-foreground"
					: "bg-background hover:bg-muted",
			)}
		>
			{label}
			<span
				className={cn(
					"rounded-full px-1.5 text-xs tabular-nums",
					active
						? "bg-primary-foreground/20"
						: tone === "success"
							? "bg-success/15 text-success"
							: "bg-muted text-muted-foreground",
				)}
			>
				{count}
			</span>
		</button>
	);
}

/**
 * One lead in the list. Reads top to bottom as: who, why they're here (one
 * sentence), their own words, and what's due — so nobody has to open a lead
 * to learn why it exists.
 */
function LeadRow({ lead, onOpen }: { lead: FiberLeadRow; onOpen: () => void }) {
	const name =
		lead.name ||
		displayName(lead.customer?.firstName, lead.customer?.lastName, {
			fallback: lead.phone ? `+${lead.phone}` : "Unnamed chat",
		});
	const overdue =
		lead.nextActionAt && new Date(lead.nextActionAt) < new Date();
	const kind = signalKind(lead.signal?.ref);
	const quote = lead.signal ? signalText(kind, lead.signal.body) : "";
	return (
		<li>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/50"
			>
				<div className="min-w-0 flex-1 space-y-1.5">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="truncate font-semibold">{name}</span>
						<StageBadge stage={lead.stage as FiberStage} />
						{lead.ogeroApproached && (
							<span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
								Ogero approached
							</span>
						)}
						<span className="text-xs text-muted-foreground">
							{lead.customer
								? (lead.customer.username ?? "Customer")
								: "Not a customer yet"}
							{lead.area ? (
								<span className="capitalize">
									{" "}
									· {lead.area}
								</span>
							) : null}
						</span>
					</div>
					{/* Why they're here */}
					<p className="text-sm font-medium leading-snug">
						{lead.summary ||
							FIBER_SOURCE_LABELS[lead.source as FiberSource] ||
							lead.source}
					</p>
					{/* Their words (or the ticket / note) */}
					{quote && (
						<p
							dir="auto"
							className="line-clamp-2 border-l-2 pl-2 text-sm text-muted-foreground"
						>
							{quote}
						</p>
					)}
					<p className="text-xs text-muted-foreground">
						{FIBER_SOURCE_LABELS[lead.source as FiberSource] ??
							lead.source}
						{lead.signal
							? ` · ${formatDateTime(lead.signal.createdAt)}`
							: ` · added ${formatDate(lead.createdAt)}`}
						{" · "}
						{lead.assignee?.name ?? "nobody assigned"}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-xs">
					{lead.nextActionAt ? (
						<span
							className={cn(
								"rounded px-1.5 py-0.5 font-medium",
								overdue
									? "bg-destructive/10 text-destructive"
									: "bg-muted text-foreground",
							)}
						>
							{overdue ? "Overdue · " : "Follow up "}
							{formatDate(lead.nextActionAt)}
						</span>
					) : null}
					<ChevronRightIcon className="size-4 text-muted-foreground" />
				</div>
			</button>
		</li>
	);
}
