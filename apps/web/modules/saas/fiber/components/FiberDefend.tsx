"use client";

import {
	FIBER_RISK_LABELS,
	FIBER_RISK_REASONS,
	type FiberRiskReason,
	type FiberStage,
} from "@repo/api/modules/fiber/lib/constants";
import { formatLebaneseLandline } from "@repo/utils";
import { Pagination } from "@saas/shared/components/Pagination";
import { ContentCard } from "@shared/components/ContentCard";
import { EmptyState } from "@shared/components/EmptyState";
import { SearchInput } from "@shared/components/SearchInput";
import { formatCurrency } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { Checkbox } from "@ui/components/checkbox";
import { Skeleton } from "@ui/components/skeleton";
import { Switch } from "@ui/components/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/components/table";
import { cn } from "@ui/lib";
import { ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAddCustomersToFiber, useAtRiskCustomers } from "../hooks/use-fiber";
import { FiberLeadSheet } from "./FiberLeadSheet";
import { StageBadge } from "./StageBadge";

const PAGE_SIZE = 50;

const REASON_TONE: Record<FiberRiskReason, string> = {
	OGERO_APPROACHED: "bg-destructive/10 text-destructive",
	FIBER_AREA: "bg-warning/15 text-warning",
	ASKED_FIBER: "bg-info/10 text-info",
	HAS_LANDLINE: "bg-muted text-foreground",
};

interface FiberDefendProps {
	organizationSlug: string;
	canManage: boolean;
	initialArea?: string | undefined;
}

export function FiberDefend({
	organizationSlug,
	canManage,
	initialArea,
}: FiberDefendProps) {
	const organizationId = useOrganizationId();
	const [area, setArea] = useState(initialArea);
	const [reason, setReason] = useState<FiberRiskReason | undefined>();
	const [notInPipeline, setNotInPipeline] = useState(true);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 250 });
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [openLeadId, setOpenLeadId] = useState<string | null>(null);
	const addCustomers = useAddCustomersToFiber();

	const query = useAtRiskCustomers({
		page,
		pageSize: PAGE_SIZE,
		notInPipeline,
		area,
		reason,
		search: debouncedSearch.trim() || undefined,
	});
	const rows = query.data?.customers ?? [];
	const total = query.data?.total ?? 0;
	const allIds = query.data?.allIds ?? [];
	const selectable = rows.filter((r) => !r.lead);
	const allOnPageSelected =
		selectable.length > 0 && selectable.every((r) => selected.has(r.id));
	const broadcastGroups = [
		...new Set(
			rows.map((r) => r.groupName).filter((g): g is string => !!g),
		),
	];

	function resetPage() {
		setPage(1);
		setSelected(new Set());
	}

	function add(ids: string[]) {
		if (!organizationId || ids.length === 0) {
			return;
		}
		addCustomers.mutate(
			{ organizationId, customerIds: ids },
			{
				onSuccess: (r) => {
					setSelected(new Set());
					toast.success(
						`${r.added} added to the pipeline${r.skipped ? ` · ${r.skipped} already there` : ""}`,
					);
				},
				onError: (e) => toast.error(e.message),
			},
		);
	}

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Customers most likely to leave for fiber — reach them before
				Ogero does. Add them to the pipeline to call them, or send them
				the fiber offer.
			</p>

			<div className="flex flex-wrap items-center gap-1.5">
				<ReasonChip
					label="All reasons"
					active={!reason}
					onClick={() => {
						setReason(undefined);
						resetPage();
					}}
				/>
				{FIBER_RISK_REASONS.map((r) => (
					<ReasonChip
						key={r}
						label={FIBER_RISK_LABELS[r]}
						active={reason === r}
						onClick={() => {
							setReason(r);
							resetPage();
						}}
					/>
				))}
				{area && (
					<ReasonChip
						label={`Area: ${area} ✕`}
						active
						onClick={() => {
							setArea(undefined);
							resetPage();
						}}
					/>
				)}
			</div>

			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<SearchInput
						value={search}
						onChange={(v) => {
							setSearch(v);
							resetPage();
						}}
						placeholder="Name or username"
						className="sm:max-w-64"
					/>
					<label
						htmlFor="fiber-not-in-pipeline"
						className="flex items-center gap-2 text-sm"
					>
						<Switch
							id="fiber-not-in-pipeline"
							checked={notInPipeline}
							onCheckedChange={(v) => {
								setNotInPipeline(v);
								resetPage();
							}}
						/>
						Only customers not in the pipeline
					</label>
				</div>
				<div className="flex flex-wrap gap-2">
					{canManage && selected.size > 0 && (
						<Button
							disabled={addCustomers.isPending}
							onClick={() => add([...selected])}
						>
							Add {selected.size} to pipeline
						</Button>
					)}
					{canManage && selected.size === 0 && allIds.length > 0 && (
						<Button
							variant="outline"
							disabled={addCustomers.isPending}
							onClick={() => add(allIds)}
						>
							Add all {allIds.length} to pipeline
						</Button>
					)}
					{broadcastGroups.length > 0 && (
						<Button variant="outline" asChild>
							<Link
								to="/app/$organizationSlug/marketing/new"
								params={{ organizationSlug }}
								search={{
									name: "Fiber offer",
									groups: broadcastGroups,
									...(reason === "HAS_LANDLINE"
										? { landline: "yes" as const }
										: {}),
								}}
							>
								Broadcast to these areas
							</Link>
						</Button>
					)}
				</div>
			</div>

			<ContentCard>
				{query.isLoading ? (
					<div className="space-y-2 p-4">
						{[0, 1, 2, 3].map((i) => (
							<Skeleton key={i} className="h-10 w-full" />
						))}
					</div>
				) : rows.length === 0 ? (
					<EmptyState
						icon={ShieldCheckIcon}
						title="Nobody at risk here"
						description="Mark the areas where Ogero boxes are going in (Overview → Areas). Customers there, and anyone who asks about fiber, show up here."
						className="m-4"
					/>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									{canManage && (
										<TableHead className="w-10">
											<Checkbox
												checked={allOnPageSelected}
												aria-label="Select page"
												onCheckedChange={(v) =>
													setSelected(
														v
															? new Set(
																	selectable.map(
																		(r) =>
																			r.id,
																	),
																)
															: new Set(),
													)
												}
											/>
										</TableHead>
									)}
									<TableHead>Customer</TableHead>
									<TableHead>Why</TableHead>
									<TableHead>Plan</TableHead>
									<TableHead>Landline</TableHead>
									<TableHead>Pipeline</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((r) => (
									<TableRow key={r.id}>
										{canManage && (
											<TableCell>
												<Checkbox
													checked={selected.has(r.id)}
													disabled={!!r.lead}
													aria-label={`Select ${r.name}`}
													onCheckedChange={(v) =>
														setSelected((prev) => {
															const next =
																new Set(prev);
															if (v) {
																next.add(r.id);
															} else {
																next.delete(
																	r.id,
																);
															}
															return next;
														})
													}
												/>
											</TableCell>
										)}
										<TableCell>
											<Link
												to="/app/$organizationSlug/customers/$customerId"
												params={{
													organizationSlug,
													customerId: r.id,
												}}
												className="font-medium hover:underline"
											>
												{r.name}
											</Link>
											<p className="text-xs text-muted-foreground">
												{r.username}
												{r.area && (
													<span className="capitalize">
														{r.username
															? " · "
															: ""}
														{r.area}
													</span>
												)}
											</p>
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{r.reasons.map((reasonKey) => (
													<span
														key={reasonKey}
														className={cn(
															"rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
															REASON_TONE[
																reasonKey
															],
														)}
													>
														{
															FIBER_RISK_LABELS[
																reasonKey
															]
														}
													</span>
												))}
											</div>
										</TableCell>
										<TableCell className="text-xs">
											{r.planName ?? "—"}
											{r.monthlyRate != null && (
												<p className="text-muted-foreground">
													{formatCurrency(
														r.monthlyRate,
													)}
													/mo
												</p>
											)}
										</TableCell>
										<TableCell
											className="text-xs tabular-nums"
											dir="ltr"
										>
											{r.landline
												? formatLebaneseLandline(
														r.landline,
													)
												: "—"}
										</TableCell>
										<TableCell>
											{r.lead ? (
												<button
													type="button"
													onClick={() =>
														setOpenLeadId(
															r.lead?.id ?? null,
														)
													}
												>
													<StageBadge
														stage={
															r.lead
																.stage as FiberStage
														}
													/>
												</button>
											) : canManage ? (
												<Button
													size="sm"
													variant="outline"
													disabled={
														addCustomers.isPending
													}
													onClick={() => add([r.id])}
												>
													Add
												</Button>
											) : (
												"—"
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</ContentCard>

			<Pagination
				totalItems={total}
				itemsPerPage={PAGE_SIZE}
				currentPage={page}
				onChangeCurrentPage={(next) => {
					setPage(next);
					setSelected(new Set());
				}}
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

function ReasonChip({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"rounded-full border px-3 py-1 text-sm transition-colors",
				active
					? "border-primary bg-primary text-primary-foreground"
					: "bg-background hover:bg-muted",
			)}
		>
			{label}
		</button>
	);
}
