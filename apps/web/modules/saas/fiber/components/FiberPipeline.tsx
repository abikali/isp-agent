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

function LeadRow({ lead, onOpen }: { lead: FiberLeadRow; onOpen: () => void }) {
	const name =
		lead.name ||
		displayName(lead.customer?.firstName, lead.customer?.lastName, {
			fallback: lead.phone ? `+${lead.phone}` : "Unnamed chat",
		});
	const overdue =
		lead.nextActionAt && new Date(lead.nextActionAt) < new Date();
	return (
		<li>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
			>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate font-medium">{name}</span>
						<StageBadge stage={lead.stage as FiberStage} />
						{lead.ogeroApproached && (
							<span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
								Ogero approached
							</span>
						)}
						{!lead.customer && (
							<span
								title="No customer account is linked to this lead yet"
								className="rounded bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info"
							>
								Not linked
							</span>
						)}
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{[
							lead.customer?.username,
							lead.area,
							FIBER_SOURCE_LABELS[lead.source as FiberSource] ??
								lead.source,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
					{lead.lastActivity?.body && (
						<p className="line-clamp-1 text-xs text-muted-foreground">
							{lead.lastActivity.body}
						</p>
					)}
				</div>
				<div className="hidden shrink-0 text-right text-xs sm:block">
					{lead.nextActionAt ? (
						<p
							className={cn(
								"font-medium",
								overdue
									? "text-destructive"
									: "text-foreground",
							)}
						>
							{overdue ? "Overdue · " : "Next · "}
							{formatDate(lead.nextActionAt)}
						</p>
					) : (
						<p className="text-muted-foreground">
							No follow-up set
						</p>
					)}
					<p className="text-muted-foreground">
						{lead.assignee?.name ?? "Unassigned"} ·{" "}
						{formatDateTime(lead.updatedAt)}
					</p>
				</div>
				<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
			</button>
		</li>
	);
}
