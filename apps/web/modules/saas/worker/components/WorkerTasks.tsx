"use client";

import { CUSTOM_RESOLUTION_VALUE } from "@repo/database/worker-options";
import { useAddonDefaultsQuery } from "@saas/installations/client";
import {
	useCompleteTaskWithEvidence,
	useCreateEvidenceUploadUrl,
} from "@saas/tasks/client";
import { useWorkerOptions } from "@saas/worker-options/client";
import { CHART_TOKENS } from "@shared/components/charts/chart-utils";
import { PhoneActions } from "@shared/components/PhoneActions";
import { customerPhoneNumbers } from "@shared/lib/customer-phones";
import { displayName } from "@shared/lib/display-name";
import { formatCurrency, formatDate } from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import { Card, CardContent } from "@ui/components/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@ui/components/chart";
import { Combobox } from "@ui/components/combobox";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import {
	BarChart3Icon,
	CalendarClockIcon,
	CheckCircle2Icon,
	ChevronDownIcon,
	ChevronUpIcon,
	ClipboardListIcon,
	ClockIcon,
	MapPinIcon,
	NavigationIcon,
	PhoneIcon,
	PlusIcon,
	PuzzleIcon,
	RadioTowerIcon,
	StickyNoteIcon,
	Trash2Icon,
	UserRoundIcon,
	WarehouseIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts is the shared chart lib statically imported across the codebase (single shared chunk)
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
	type TaskCategoryValue,
	type TaskStatusValue,
	useMyEmployeeId,
	useMyStatsQuery,
	useMyTasksList,
	useMyTrendQuery,
	useUninstallItemsQuery,
} from "../hooks/use-worker";
import { InstallItemRows } from "./InstallItemRows";
import { type InstallLine, linesToPayload } from "./install-lines";
import { PhotoCaptureInput } from "./PhotoCaptureInput";
import {
	formatWhen,
	Pager,
	SearchBar,
	SelectControl,
	StatStrip,
} from "./WorkerUI";

const TREND_PERIODS = [
	{ value: "3", label: "3 months" },
	{ value: "6", label: "6 months" },
	{ value: "12", label: "12 months" },
];
const trendConfig = {
	completed: { label: "Completed", color: CHART_TOKENS.c1 },
	newUsers: { label: "New users", color: CHART_TOKENS.c2 },
} satisfies ChartConfig;

type WorkerTask = ReturnType<typeof useMyTasksList>["tasks"][number];

const STATUS_OPTIONS = [
	{ value: "open", label: "Open" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "all", label: "All statuses" },
];
const STATUS_MAP: Record<string, TaskStatusValue[] | undefined> = {
	open: ["OPEN"],
	// Submitted completions awaiting admin approval live with "completed"
	// from the worker's point of view — the field work is done.
	completed: ["PENDING_APPROVAL", "COMPLETED"],
	cancelled: ["CANCELLED"],
	all: undefined,
};
const CATEGORY_OPTIONS = [
	{ value: "all", label: "All types" },
	{ value: "INSTALLATION", label: "Installation" },
	{ value: "MAINTENANCE", label: "Maintenance" },
	{ value: "UNINSTALL", label: "Uninstall" },
	{ value: "REPLACEMENT", label: "Replacement" },
];
const SORT_OPTIONS = [
	{ value: "newest", label: "Newest first" },
	{ value: "oldest", label: "Oldest first" },
	{ value: "priority", label: "Priority" },
];
const SORT_MAP: Record<
	string,
	{ sortBy: "createdAt" | "priority"; sortOrder: "asc" | "desc" }
> = {
	newest: { sortBy: "createdAt", sortOrder: "desc" },
	oldest: { sortBy: "createdAt", sortOrder: "asc" },
	priority: { sortBy: "priority", sortOrder: "desc" },
};
const OPEN_STATUSES = new Set(["OPEN"]);

const ADDON_LABELS: Record<string, string> = {
	IPTV: "IPTV",
	REAL_IP: "Real IP",
};

/**
 * Pre-fill installation lines from the add-ons the admin requested on the task,
 * so the worker just confirms them at completion. Only for customer tasks.
 */
function seedAddonLines(
	requestedAddons: string[] | undefined,
	defaults: { iptvPrice: number; realIpPrice: number },
): InstallLine[] {
	if (!requestedAddons?.length) {
		return [];
	}
	return requestedAddons
		.filter((a): a is "IPTV" | "REAL_IP" => a === "IPTV" || a === "REAL_IP")
		.map((addonType, i) => ({
			key: i + 1,
			kind: "addon" as const,
			stockItemId: null,
			addonType,
			quantity: 1,
			price:
				addonType === "IPTV"
					? defaults.iptvPrice
					: defaults.realIpPrice,
		}));
}

/**
 * Installation-line state pre-seeded once from the task's requested add-ons
 * (after add-on default prices have loaded, so seeded prices are correct).
 */
function useInstallLines(task: WorkerTask) {
	const { iptvPrice, realIpPrice, isLoading } = useAddonDefaultsQuery();
	const [lines, setLines] = useState<InstallLine[]>([]);
	const seeded = useRef(false);
	useEffect(() => {
		if (seeded.current || isLoading) {
			return;
		}
		seeded.current = true;
		if (task.customer && task.requestedAddons?.length) {
			setLines(
				seedAddonLines(task.requestedAddons, {
					iptvPrice,
					realIpPrice,
				}),
			);
		}
	}, [isLoading, iptvPrice, realIpPrice, task]);
	return [lines, setLines] as const;
}

// Only the attention-grabbing priorities get a badge; low/medium stay quiet.
const PRIORITY_BADGE: Record<
	string,
	{ label: string; variant: "warning" | "error" } | undefined
> = {
	HIGH: { label: "High", variant: "warning" },
	URGENT: { label: "Urgent", variant: "error" },
};

interface RecoveredItem {
	key: number;
	stockItemId: string | null;
	quantity: number;
	pictureUrl: string | null;
}

/** Injectable signed-URL getter shared by every photo field in this module. */
function useUploadUrlGetter(organizationId: string | null) {
	const createUploadUrl = useCreateEvidenceUploadUrl();
	return useCallback(
		async (file: File) => {
			if (!organizationId) {
				throw new Error("No organization");
			}
			const result = await createUploadUrl.mutateAsync({
				organizationId,
				filename: file.name,
				contentType: file.type,
			});
			return {
				uploadUrl: result.uploadUrl,
				publicUrl: result.publicUrl,
			};
		},
		[organizationId, createUploadUrl],
	);
}

export function WorkerTasks() {
	const { stats, isLoading: statsLoading } = useMyStatsQuery();
	const [activeTask, setActiveTask] = useState<WorkerTask | null>(null);
	const [search, setSearch] = useState("");
	const [debouncedSearch] = useDebouncedValue(search, { wait: 300 });
	const [statusFilter, setStatusFilter] = useState("open");
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [sort, setSort] = useState("newest");
	const [page, setPage] = useState(1);

	const sortCfg =
		SORT_MAP[sort] ?? ({ sortBy: "createdAt", sortOrder: "desc" } as const);
	const { tasks, totalPages, isLoading, isFetching } = useMyTasksList({
		search: debouncedSearch || undefined,
		statuses: STATUS_MAP[statusFilter],
		category:
			categoryFilter === "all"
				? undefined
				: (categoryFilter as TaskCategoryValue),
		sortBy: sortCfg.sortBy,
		sortOrder: sortCfg.sortOrder,
		page,
	});

	function onFilter<T>(setter: (value: T) => void) {
		return (value: T) => {
			setter(value);
			setPage(1);
		};
	}

	const statItems = [
		{ label: "Open", value: String(stats?.tasks.open ?? 0) },
		{
			label: "Done (mo)",
			value: String(stats?.tasks.completedThisMonth ?? 0),
		},
		{
			label: "Installs (mo)",
			value: String(stats?.installations.completedThisMonth ?? 0),
		},
		{
			label: "Value (mo)",
			value: formatCurrency(stats?.installations.valueThisMonth ?? 0),
		},
	];

	return (
		<div className="space-y-3">
			<StatStrip items={statItems} isLoading={statsLoading} />

			<TaskTrendChart />

			<SearchBar
				value={search}
				onChange={onFilter(setSearch)}
				placeholder="Search tasks…"
			/>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
				<SelectControl
					ariaLabel="Filter by status"
					value={statusFilter}
					onChange={onFilter(setStatusFilter)}
					options={STATUS_OPTIONS}
					className="w-full"
				/>
				<SelectControl
					ariaLabel="Filter by type"
					value={categoryFilter}
					onChange={onFilter(setCategoryFilter)}
					options={CATEGORY_OPTIONS}
					className="w-full"
				/>
				<SelectControl
					ariaLabel="Sort tasks"
					value={sort}
					onChange={onFilter(setSort)}
					options={SORT_OPTIONS}
					className="col-span-2 w-full sm:col-span-1"
				/>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton
							key={`task-skel-${i}`}
							className="h-24 rounded-lg"
						/>
					))}
				</div>
			) : tasks.length === 0 ? (
				<div className="py-16 text-center">
					<ClipboardListIcon className="mx-auto size-10 text-muted-foreground/50" />
					<p className="mt-3 text-sm text-muted-foreground">
						No tasks match your filters.
					</p>
				</div>
			) : (
				<div className="space-y-2">
					{tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							onSubmit={() => setActiveTask(task)}
						/>
					))}
				</div>
			)}

			<Pager
				page={page}
				totalPages={totalPages}
				onPageChange={setPage}
				isFetching={isFetching}
			/>

			{activeTask && (
				<TaskSubmitSheet
					task={activeTask}
					onClose={() => setActiveTask(null)}
				/>
			)}
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- trend chart colocated with the tasks tab
function TaskTrendChart() {
	const [open, setOpen] = useState(false);
	const [months, setMonths] = useState<"3" | "6" | "12">("6");
	const { trend, isFetching } = useMyTrendQuery(
		Number(months) as 3 | 6 | 12,
		open,
	);
	const hasData = trend.some((t) => t.completed > 0 || t.newUsers > 0);

	return (
		<div className="overflow-hidden rounded-lg border">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center justify-between px-4 py-3 font-medium text-sm"
				aria-expanded={open}
			>
				<span className="flex items-center gap-2">
					<BarChart3Icon className="size-4 text-muted-foreground" />
					Monthly trend
				</span>
				{open ? (
					<ChevronUpIcon className="size-4 text-muted-foreground" />
				) : (
					<ChevronDownIcon className="size-4 text-muted-foreground" />
				)}
			</button>
			{open && (
				<div className="space-y-3 border-t px-3 pt-3 pb-4">
					<div className="flex justify-end">
						<SelectControl
							ariaLabel="Trend period"
							value={months}
							onChange={(v) => setMonths(v as "3" | "6" | "12")}
							options={TREND_PERIODS}
						/>
					</div>
					{isFetching && trend.length === 0 ? (
						<Skeleton className="h-56 w-full rounded-lg" />
					) : hasData ? (
						// Phones are too narrow for a year of month labels, and
						// recharts silently drops the ones that would overlap.
						// Giving each month a fixed slice and scrolling the
						// overflow keeps every label readable at any width.
						<div className="-mx-1 overflow-x-auto px-1 pb-1">
							<div
								style={{
									minWidth: `max(100%, ${trend.length * 48}px)`,
								}}
							>
								<ChartContainer
									config={trendConfig}
									className="h-56 w-full"
								>
									<BarChart
										data={trend}
										margin={{
											left: -8,
											right: 4,
											top: 8,
											bottom: 0,
										}}
									>
										<CartesianGrid
											strokeDasharray="3 3"
											stroke={CHART_TOKENS.grid}
											vertical={false}
										/>
										<XAxis
											dataKey="label"
											stroke={CHART_TOKENS.axis}
											tickLine={false}
											axisLine={false}
											fontSize={11}
											interval={0}
											tickMargin={6}
											minTickGap={0}
										/>
										<YAxis
											allowDecimals={false}
											stroke={CHART_TOKENS.axis}
											tickLine={false}
											axisLine={false}
											fontSize={11}
											width={32}
										/>
										<ChartTooltip
											content={<ChartTooltipContent />}
										/>
										<ChartLegend
											content={<ChartLegendContent />}
										/>
										<Bar
											dataKey="completed"
											fill={CHART_TOKENS.c1}
											radius={[3, 3, 0, 0]}
										/>
										<Bar
											dataKey="newUsers"
											fill={CHART_TOKENS.c2}
											radius={[3, 3, 0, 0]}
										/>
									</BarChart>
								</ChartContainer>
							</div>
						</div>
					) : (
						<p className="py-8 text-center text-muted-foreground text-sm">
							No activity in this period.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * Compact elapsed time, at most two units: "45s", "12m 30s", "5h 12m",
 * "3d 4h", "2w 1d", "3mo 1w". The smaller unit is dropped when it is zero.
 */
function formatAge(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);

	function pair(value: number, unit: string, rest: number, restUnit: string) {
		return rest > 0
			? `${value}${unit} ${rest}${restUnit}`
			: `${value}${unit}`;
	}

	if (minutes < 60) {
		return pair(minutes, "m", seconds % 60, "s");
	}
	if (hours < 24) {
		return pair(hours, "h", minutes % 60, "m");
	}
	if (days < 7) {
		return pair(days, "d", hours % 24, "h");
	}
	if (days < 30) {
		return pair(weeks, "w", days % 7, "d");
	}
	return pair(months, "mo", Math.floor((days % 30) / 7), "w");
}

/** How often the label needs redrawing to stay truthful at its current size. */
function tickInterval(ms: number): number {
	if (ms < 3_600_000) {
		return 1_000;
	}
	if (ms < 86_400_000) {
		return 60_000;
	}
	return 300_000;
}

/**
 * Escalating urgency for an open task, keyed off how long it has been sitting
 * with the worker: today is calm, yesterday needs a look, a week is a problem.
 */
const AGE_TIERS = [
	{
		after: 7 * 86_400_000,
		className:
			"bg-destructive/10 text-destructive font-semibold dark:text-red-300",
	},
	{
		after: 3 * 86_400_000,
		className:
			"bg-orange-500/15 font-medium text-orange-700 dark:text-orange-300",
	},
	{
		after: 86_400_000,
		className:
			"bg-amber-500/10 font-medium text-amber-700 dark:text-amber-300",
	},
	{ after: 0, className: "bg-muted text-muted-foreground" },
];

/**
 * Live "how long has this been on my plate" timer for an open task, measured
 * from the moment it was assigned to *this* worker (falling back to the task's
 * own creation when it predates assignment tracking).
 */
// react-doctor-disable-next-line react-doctor/no-multi-comp -- age timer colocated with the task card it annotates
function TaskAgeTimer({ task }: { task: WorkerTask }) {
	const myEmployeeId = useMyEmployeeId();

	const mine = task.assignments.find(
		(assignment) => assignment.employee.id === myEmployeeId,
	);
	const earliest = task.assignments.reduce<Date | null>((oldest, current) => {
		const at = new Date(current.assignedAt);
		return oldest === null || at < oldest ? at : oldest;
	}, null);
	const since = mine
		? new Date(mine.assignedAt)
		: (earliest ?? new Date(task.createdAt));
	const startedAt = since.getTime();

	const [elapsed, setElapsed] = useState(() => Date.now() - startedAt);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			const next = Date.now() - startedAt;
			setElapsed(next);
			timer = setTimeout(tick, tickInterval(next));
		};
		tick();
		return () => clearTimeout(timer);
	}, [startedAt]);

	const tier = AGE_TIERS.find((t) => elapsed >= t.after) ?? AGE_TIERS.at(-1);

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md px-2.5 py-1.5 text-xs",
				tier?.className,
			)}
		>
			<ClockIcon className="size-3.5 shrink-0" />
			<span>Assigned</span>
			<span className="font-mono tabular-nums" suppressHydrationWarning>
				{formatAge(elapsed)}
			</span>
			<span>ago</span>
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-multi-comp -- task card colocated with its list
function TaskCard({
	task,
	onSubmit,
}: {
	task: WorkerTask;
	onSubmit: () => void;
}) {
	const customerName = task.customer
		? displayName(task.customer.firstName, task.customer.lastName)
		: null;
	// Everything a worker reaches for on the way to a job: call, message, navigate.
	// Every number we hold, not just the primary — the one that answers (or is
	// on WhatsApp) is often the second one.
	const phoneNumbers = customerPhoneNumbers(task.customer);
	// Coordinates when we have them (exact), else let Maps search the address.
	const destination =
		task.customer?.latitude != null && task.customer?.longitude != null
			? `${task.customer.latitude},${task.customer.longitude}`
			: task.customer?.address || null;
	const directionsUrl = destination
		? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
		: null;
	const isUninstall = task.category === "UNINSTALL";
	const isReplacement = task.category === "REPLACEMENT";
	const isOpen = OPEN_STATUSES.has(task.status);
	const isCompleted = task.status === "COMPLETED";
	const priorityBadge = PRIORITY_BADGE[task.priority];
	const isOverdue =
		isOpen && task.dueDate !== null && new Date(task.dueDate) < new Date();

	// A colored left edge gives the list a scannable urgency hierarchy:
	// red = needs attention now (overdue/urgent), amber = high priority.
	const accent =
		isOverdue || task.priority === "URGENT"
			? "border-l-4 border-l-destructive"
			: task.priority === "HIGH"
				? "border-l-4 border-l-amber-500"
				: "";

	return (
		<Card className={cn("overflow-hidden", accent)}>
			<CardContent className="space-y-3 p-4">
				{/* Header — title, description, category & priority */}
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 space-y-1">
						<p className="font-semibold text-sm leading-snug">
							{task.title}
						</p>
						{task.description ? (
							<p className="line-clamp-2 text-muted-foreground text-xs">
								{task.description}
							</p>
						) : null}
					</div>
					<div className="flex shrink-0 flex-col items-end gap-1">
						<Badge
							variant={
								isUninstall || isReplacement
									? "warning"
									: "info"
							}
						>
							{task.category.toLowerCase()}
						</Badge>
						{priorityBadge ? (
							<Badge variant={priorityBadge.variant}>
								{priorityBadge.label}
							</Badge>
						) : null}
					</div>
				</div>

				{/* How long it has been waiting on this worker */}
				{isOpen ? <TaskAgeTimer task={task} /> : null}

				{/* Base — the worker's destination, highlighted */}
				{task.base ? (
					<div className="flex items-start gap-2 rounded-md bg-primary/5 px-2.5 py-2">
						<WarehouseIcon className="mt-0.5 size-4 shrink-0 text-primary" />
						<div className="min-w-0">
							<p className="font-medium text-foreground text-xs">
								{task.base.name}
							</p>
							{task.base.address ? (
								<p className="text-muted-foreground text-xs">
									{task.base.address}
								</p>
							) : null}
						</div>
					</div>
				) : null}

				{/* Customer — who & where, then the actions to reach them */}
				{customerName ? (
					<div className="space-y-2 text-muted-foreground text-xs">
						<div className="space-y-1">
							<p className="font-medium text-foreground">
								{customerName}
								{task.customer?.accountNumber ? (
									<span className="ml-1.5 font-normal text-muted-foreground">
										#{task.customer.accountNumber}
									</span>
								) : null}
							</p>
							{task.customer?.address ? (
								<p className="flex items-start gap-1">
									<MapPinIcon className="mt-px size-3 shrink-0" />
									<span>{task.customer.address}</span>
								</p>
							) : null}
							{phoneNumbers.map((number) => (
								<p
									key={number}
									className="flex items-center gap-1"
								>
									<PhoneIcon className="size-3 shrink-0" />
									{number}
								</p>
							))}
						</div>
						{phoneNumbers.length > 0 || directionsUrl ? (
							<div className="flex flex-wrap gap-2">
								<PhoneActions numbers={phoneNumbers} />
								{directionsUrl ? (
									<Button
										variant="outline"
										size="sm"
										className="h-8 flex-1 basis-24 text-xs"
										asChild
									>
										<a
											href={directionsUrl}
											target="_blank"
											rel="noopener noreferrer"
										>
											<NavigationIcon />
											Directions
										</a>
									</Button>
								) : null}
							</div>
						) : null}
					</div>
				) : null}

				{/* Add-ons the worker must set up on this visit */}
				{task.requestedAddons && task.requestedAddons.length > 0 ? (
					<div className="flex items-start gap-2 rounded-md bg-purple-500/10 px-2.5 py-2">
						<PuzzleIcon className="mt-0.5 size-4 shrink-0 text-purple-500" />
						<div className="min-w-0">
							<p className="font-medium text-purple-700 text-xs dark:text-purple-300">
								Set up:{" "}
								{task.requestedAddons
									.map((a) => ADDON_LABELS[a] ?? a)
									.join(", ")}
							</p>
							<p className="text-muted-foreground text-xs">
								Confirm on the customer when you complete the
								task.
							</p>
						</div>
					</div>
				) : null}

				{/* Meta — station & due date */}
				{task.station || task.dueDate ? (
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
						{task.station ? (
							<span className="flex items-center gap-1">
								<RadioTowerIcon className="size-3 shrink-0" />
								{task.station.name}
							</span>
						) : null}
						{task.dueDate ? (
							<span
								className={
									isOverdue
										? "flex items-center gap-1 font-medium text-destructive"
										: "flex items-center gap-1"
								}
							>
								<CalendarClockIcon className="size-3 shrink-0" />
								Due{" "}
								{formatDate(task.dueDate, {
									dateStyle: "medium",
								})}
								{isOverdue ? " · overdue" : ""}
							</span>
						) : null}
					</div>
				) : null}

				{/* Notes */}
				{task.notes ? (
					<p className="flex items-start gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5 text-muted-foreground text-xs">
						<StickyNoteIcon className="mt-0.5 size-3 shrink-0" />
						<span className="line-clamp-3">{task.notes}</span>
					</p>
				) : null}

				{/* Completion summary — when & what was resolved */}
				{isCompleted ? (
					<div className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-2.5 py-2">
						<CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
						<div className="min-w-0 text-xs">
							<p className="font-medium text-emerald-700 dark:text-emerald-300">
								Completed
								{task.completedAt
									? ` · ${formatWhen(task.completedAt)}`
									: ""}
							</p>
							{task.resolutionNote ? (
								<p className="text-muted-foreground">
									{task.resolutionNote}
								</p>
							) : null}
						</div>
					</div>
				) : null}

				{/* Footer — created when / by whom & action */}
				<div className="flex items-end justify-between gap-2 border-t pt-2">
					<div className="min-w-0 space-y-0.5 text-muted-foreground text-xs">
						<span className="flex items-center gap-1">
							<ClockIcon className="size-3 shrink-0" />
							{formatWhen(task.createdAt)}
						</span>
						{task.createdBy ? (
							<span className="flex items-center gap-1 truncate">
								<UserRoundIcon className="size-3 shrink-0" />
								<span className="truncate">
									by {task.createdBy.name}
								</span>
							</span>
						) : null}
					</div>
					{isOpen ? (
						<Button size="sm" onClick={onSubmit}>
							Submit
						</Button>
					) : (
						<Badge variant={isCompleted ? "success" : "outline"}>
							{task.status.toLowerCase().replace("_", " ")}
						</Badge>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/** Routes a task to the right completion sheet based on its category. */
function TaskSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	switch (task.category) {
		case "INSTALLATION":
			return <InstallSubmitSheet task={task} onClose={onClose} />;
		case "REPLACEMENT":
			return <ReplacementSubmitSheet task={task} onClose={onClose} />;
		case "UNINSTALL":
			return <UninstallSubmitSheet task={task} onClose={onClose} />;
		default:
			return <MaintenanceSubmitSheet task={task} onClose={onClose} />;
	}
}

function MaintenanceSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const complete = useCompleteTaskWithEvidence();
	const getUploadUrl = useUploadUrlGetter(organizationId);
	// Admin-managed list (Settings → Worker Dropdowns). Keeps preferring
	// "No problem found" as the default; falls back to the first option if the
	// admin removed it, and stands in while the list loads.
	const { options: resolutionOptions } = useWorkerOptions("TASK_RESOLUTION");
	const [pickedResolution, setPickedResolution] = useState("");
	const resolutionCode =
		pickedResolution ||
		resolutionOptions.find((o) => o.value === "no_problem")?.value ||
		resolutionOptions[0]?.value ||
		"";
	const [note, setNote] = useState("");
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	// Items/add-ons used during the visit are recorded but never required.
	const [lines, setLines] = useInstallLines(task);
	// Equipment removed during the visit (optional — most maintenance visits
	// recover nothing, but removals often happen on non-UNINSTALL tasks too).
	const [recovered, setRecovered] = useState<RecoveredItem[]>([]);

	const installedItems = linesToPayload(lines);
	const recoveredOk =
		recovered.length === 0 || recoveredItemsValid(recovered);

	async function handleSubmit() {
		if (!organizationId || !recoveredOk) {
			return;
		}
		if (resolutionCode === CUSTOM_RESOLUTION_VALUE && !note.trim()) {
			toast.error("A note is required for 'Other'");
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				resolutionCode,
				resolutionNote: note.trim() || undefined,
				photoUrl: photoUrl ?? undefined,
				...(installedItems.length > 0 ? { installedItems } : {}),
				...(recovered.length > 0
					? { recoveredItems: recoveredItemsPayload(recovered) }
					: {}),
			});
			toast.success("Task completed");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<SubmitSheet
			title={`Complete — ${task.title}`}
			submitLabel="Complete task"
			pending={complete.isPending}
			disabled={!recoveredOk}
			onClose={onClose}
			onSubmit={handleSubmit}
		>
			<div className="space-y-1.5">
				<Label>What did you find?</Label>
				<Combobox
					value={resolutionCode}
					onChange={setPickedResolution}
					searchPlaceholder="Search…"
					options={resolutionOptions}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="maint-note">
					Note{resolutionCode === CUSTOM_RESOLUTION_VALUE ? " *" : ""}
				</Label>
				<Textarea
					id="maint-note"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={2}
					placeholder="Anything worth noting?"
				/>
			</div>
			<div className="space-y-1.5">
				<Label>
					{task.requestedAddons?.length
						? "Items & add-ons"
						: "Items used (optional)"}
				</Label>
				<InstallItemRows
					lines={lines}
					onChange={setLines}
					allowAddons={Boolean(task.customer)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Recovered equipment (optional)</Label>
				<RecoveredItemsEditor
					items={recovered}
					onChange={setRecovered}
					getUploadUrl={getUploadUrl}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Photo (optional)</Label>
				<PhotoCaptureInput
					value={photoUrl}
					onChange={setPhotoUrl}
					getUploadUrl={getUploadUrl}
				/>
			</div>
		</SubmitSheet>
	);
}

function InstallSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const complete = useCompleteTaskWithEvidence();
	const getUploadUrl = useUploadUrlGetter(organizationId);
	const [lines, setLines] = useInstallLines(task);
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [note, setNote] = useState("");

	const installedItems = linesToPayload(lines);
	const valid = installedItems.length > 0 && photoUrl !== null;

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				installedItems,
				photoUrl: photoUrl as string,
				resolutionNote: note.trim() || undefined,
			});
			toast.success("Installation submitted for approval");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<SubmitSheet
			title={`Install — ${task.title}`}
			submitLabel="Submit installation"
			pending={complete.isPending}
			disabled={!valid}
			onClose={onClose}
			onSubmit={handleSubmit}
		>
			<div className="space-y-1.5">
				<Label>Installed items *</Label>
				<InstallItemRows
					lines={lines}
					onChange={setLines}
					allowAddons={Boolean(task.customer)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Photo *</Label>
				<PhotoCaptureInput
					value={photoUrl}
					onChange={setPhotoUrl}
					getUploadUrl={getUploadUrl}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="install-note">Note (optional)</Label>
				<Textarea
					id="install-note"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={2}
					placeholder="Anything worth noting?"
				/>
			</div>
		</SubmitSheet>
	);
}

function ReplacementSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const complete = useCompleteTaskWithEvidence();
	const getUploadUrl = useUploadUrlGetter(organizationId);
	const [lines, setLines] = useInstallLines(task);
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [recovered, setRecovered] = useState<RecoveredItem[]>([
		newRecoveredItem(1),
	]);

	const installedItems = linesToPayload(lines);
	const valid =
		installedItems.length > 0 &&
		photoUrl !== null &&
		recoveredItemsValid(recovered);

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				installedItems,
				recoveredItems: recoveredItemsPayload(recovered),
				photoUrl: photoUrl as string,
			});
			toast.success("Replacement submitted for approval");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<SubmitSheet
			title={`Replacement — ${task.title}`}
			submitLabel="Submit replacement"
			pending={complete.isPending}
			disabled={!valid}
			onClose={onClose}
			onSubmit={handleSubmit}
		>
			<div className="space-y-1.5">
				<Label>New installed items *</Label>
				<InstallItemRows
					lines={lines}
					onChange={setLines}
					allowAddons={Boolean(task.customer)}
				/>
			</div>
			<div className="space-y-1.5">
				<Label>Install photo *</Label>
				<PhotoCaptureInput
					value={photoUrl}
					onChange={setPhotoUrl}
					getUploadUrl={getUploadUrl}
				/>
			</div>
			<div className="space-y-2 border-t pt-4">
				<Label>Recovered (old) equipment *</Label>
				<RecoveredItemsEditor
					items={recovered}
					onChange={setRecovered}
					getUploadUrl={getUploadUrl}
				/>
			</div>
		</SubmitSheet>
	);
}

function UninstallSubmitSheet({
	task,
	onClose,
}: {
	task: WorkerTask;
	onClose: () => void;
}) {
	const organizationId = useOrganizationId();
	const complete = useCompleteTaskWithEvidence();
	const getUploadUrl = useUploadUrlGetter(organizationId);
	const [items, setItems] = useState<RecoveredItem[]>([newRecoveredItem(1)]);

	const valid = recoveredItemsValid(items);

	async function handleSubmit() {
		if (!organizationId || !valid) {
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				recoveredItems: recoveredItemsPayload(items),
			});
			toast.success("Recovered items submitted for review");
			onClose();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to submit",
			);
		}
	}

	return (
		<SubmitSheet
			title={`Recovered equipment — ${task.title}`}
			submitLabel="Submit for review"
			pending={complete.isPending}
			disabled={!valid}
			onClose={onClose}
			onSubmit={handleSubmit}
		>
			<RecoveredItemsEditor
				items={items}
				onChange={setItems}
				getUploadUrl={getUploadUrl}
			/>
		</SubmitSheet>
	);
}

// ── Shared building blocks ──────────────────────────────────────────────

function SubmitSheet({
	title,
	submitLabel,
	pending,
	disabled = false,
	onClose,
	onSubmit,
	children,
}: {
	title: string;
	submitLabel: string;
	pending: boolean;
	disabled?: boolean;
	onClose: () => void;
	onSubmit: () => void;
	children: React.ReactNode;
}) {
	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="bottom"
				className="flex max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0"
			>
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle>{title}</SheetTitle>
				</SheetHeader>
				<div className="flex-1 space-y-4 px-4 py-4">{children}</div>
				<SheetFooter className="border-t px-4 py-3">
					<Button
						className="w-full"
						onClick={onSubmit}
						disabled={pending || disabled}
					>
						{pending ? "Submitting…" : submitLabel}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function newRecoveredItem(key: number): RecoveredItem {
	return {
		key,
		stockItemId: null,
		quantity: 1,
		pictureUrl: null,
	};
}

function recoveredItemsValid(items: RecoveredItem[]): boolean {
	return (
		items.length > 0 &&
		items.every(
			(item) =>
				item.stockItemId &&
				item.quantity >= 1 &&
				item.pictureUrl !== null,
		)
	);
}

function recoveredItemsPayload(items: RecoveredItem[]) {
	// Validity is enforced by recoveredItemsValid before submit.
	return items.map((item) => ({
		stockItemId: item.stockItemId as string,
		quantity: item.quantity,
		pictureUrl: item.pictureUrl as string,
	}));
}

/** Controlled multi-row editor for recovered equipment (per-item photo). */
function RecoveredItemsEditor({
	items,
	onChange,
	getUploadUrl,
}: {
	items: RecoveredItem[];
	onChange: (items: RecoveredItem[]) => void;
	getUploadUrl: (file: File) => Promise<{
		uploadUrl: string;
		publicUrl: string;
	}>;
}) {
	// Recovered gear is the customer's old equipment, so the options are the
	// admin-curated `showInUninstall` list — never the worker's own stock.
	const { items: uninstallItems } = useUninstallItemsQuery();

	const stockOptions = uninstallItems.map((i) => ({
		value: i.id,
		label: i.name,
	}));

	function updateItem(key: number, patch: Partial<RecoveredItem>) {
		onChange(
			items.map((item) =>
				item.key === key ? { ...item, ...patch } : item,
			),
		);
	}

	return (
		<div className="space-y-4">
			{items.map((item, index) => (
				<div key={item.key} className="space-y-3 rounded-md border p-3">
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium">Item {index + 1}</p>
						{items.length > 1 && (
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								onClick={() =>
									onChange(
										items.filter((i) => i.key !== item.key),
									)
								}
								aria-label="Remove item"
							>
								<Trash2Icon className="size-4" />
							</Button>
						)}
					</div>
					<div className="space-y-1.5">
						<Label>Item</Label>
						<Combobox
							value={item.stockItemId ?? ""}
							placeholder="Select an item…"
							searchPlaceholder="Search items…"
							onChange={(v) =>
								updateItem(item.key, { stockItemId: v })
							}
							options={stockOptions}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Quantity</Label>
						<Input
							type="number"
							inputMode="numeric"
							min={1}
							value={item.quantity}
							onChange={(e) =>
								updateItem(item.key, {
									quantity: Number(e.target.value),
								})
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Photo evidence *</Label>
						<PhotoCaptureInput
							value={item.pictureUrl}
							onChange={(url) =>
								updateItem(item.key, { pictureUrl: url })
							}
							getUploadUrl={getUploadUrl}
						/>
					</div>
				</div>
			))}
			<Button
				variant="outline"
				className="w-full"
				onClick={() =>
					onChange([
						...items,
						newRecoveredItem(
							Math.max(...items.map((i) => i.key), 0) + 1,
						),
					])
				}
			>
				<PlusIcon className="mr-2 size-4" />
				{items.length === 0 ? "Add recovered item" : "Add another item"}
			</Button>
		</div>
	);
}
