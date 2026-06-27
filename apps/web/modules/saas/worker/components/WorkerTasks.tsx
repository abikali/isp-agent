"use client";

import { TASK_RESOLUTION_OPTIONS } from "@saas/tasks";
import {
	useCompleteTaskWithEvidence,
	useCreateEvidenceUploadUrl,
} from "@saas/tasks/client";
import { CHART_TOKENS } from "@shared/components/charts/chart-utils";
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
import {
	BarChart3Icon,
	ChevronDownIcon,
	ChevronUpIcon,
	ClipboardListIcon,
	MapPinIcon,
	PhoneIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useCallback, useState } from "react";
// react-doctor-disable-next-line react-doctor/prefer-dynamic-import -- recharts is the shared chart lib statically imported across the codebase (single shared chunk)
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import {
	type TaskCategoryValue,
	type TaskStatusValue,
	useMyStatsQuery,
	useMyStockQuery,
	useMyTasksList,
	useMyTrendQuery,
} from "../hooks/use-worker";
import { InstallItemRows } from "./InstallItemRows";
import { type InstallLine, linesToPayload } from "./install-lines";
import { PhotoCaptureInput } from "./PhotoCaptureInput";
import { Pager, SearchBar, SelectControl, StatStrip } from "./WorkerUI";

const TREND_PERIODS = [
	{ value: "3", label: "3 months" },
	{ value: "6", label: "6 months" },
	{ value: "12", label: "12 months" },
];
const trendConfig = {
	completed: { label: "Completed", color: CHART_TOKENS.c1 },
	items: { label: "Items installed", color: CHART_TOKENS.c2 },
} satisfies ChartConfig;

type WorkerTask = ReturnType<typeof useMyTasksList>["tasks"][number];

const STATUS_OPTIONS = [
	{ value: "open", label: "Open" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "all", label: "All statuses" },
];
const STATUS_MAP: Record<string, TaskStatusValue[] | undefined> = {
	open: ["OPEN", "IN_PROGRESS", "ON_HOLD"],
	completed: ["COMPLETED"],
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
const OPEN_STATUSES = new Set(["OPEN", "IN_PROGRESS", "ON_HOLD"]);

interface RecoveredItem {
	key: number;
	stockItemId: string | null;
	itemName: string;
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
			<div className="flex flex-wrap items-center gap-2">
				<SelectControl
					ariaLabel="Filter by status"
					value={statusFilter}
					onChange={onFilter(setStatusFilter)}
					options={STATUS_OPTIONS}
				/>
				<SelectControl
					ariaLabel="Filter by type"
					value={categoryFilter}
					onChange={onFilter(setCategoryFilter)}
					options={CATEGORY_OPTIONS}
				/>
				<SelectControl
					ariaLabel="Sort tasks"
					value={sort}
					onChange={onFilter(setSort)}
					options={SORT_OPTIONS}
					className="ml-auto"
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
	const hasData = trend.some((t) => t.completed > 0 || t.items > 0);

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
						<ChartContainer
							config={trendConfig}
							className="h-56 w-full"
						>
							<BarChart
								data={trend}
								margin={{
									left: -16,
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
								/>
								<YAxis
									allowDecimals={false}
									stroke={CHART_TOKENS.axis}
									tickLine={false}
									axisLine={false}
									fontSize={11}
									width={28}
								/>
								<ChartTooltip
									content={<ChartTooltipContent />}
								/>
								<ChartLegend content={<ChartLegendContent />} />
								<Bar
									dataKey="completed"
									fill={CHART_TOKENS.c1}
									radius={[3, 3, 0, 0]}
								/>
								<Bar
									dataKey="items"
									fill={CHART_TOKENS.c2}
									radius={[3, 3, 0, 0]}
								/>
							</BarChart>
						</ChartContainer>
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
	const isUninstall = task.category === "UNINSTALL";
	const isReplacement = task.category === "REPLACEMENT";
	const isOpen = OPEN_STATUSES.has(task.status);
	return (
		<Card>
			<CardContent className="space-y-2 p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="font-medium text-sm">{task.title}</p>
						{task.description ? (
							<p className="line-clamp-2 text-muted-foreground text-xs">
								{task.description}
							</p>
						) : null}
					</div>
					<Badge
						variant={
							isUninstall || isReplacement ? "warning" : "info"
						}
					>
						{task.category.toLowerCase()}
					</Badge>
				</div>
				{customerName ? (
					<div className="space-y-1 text-muted-foreground text-xs">
						<p className="font-medium text-foreground">
							{customerName}
						</p>
						{task.customer?.address ? (
							<p className="flex items-center gap-1">
								<MapPinIcon className="size-3" />
								{task.customer.address}
							</p>
						) : null}
						{task.customer?.mobile ? (
							<a
								href={`tel:${task.customer.mobile}`}
								className="flex items-center gap-1 text-primary"
							>
								<PhoneIcon className="size-3" />
								{task.customer.mobile}
							</a>
						) : null}
					</div>
				) : null}
				<div className="flex items-center justify-between pt-1">
					<span className="text-muted-foreground text-xs">
						{formatDate(task.createdAt, { dateStyle: "medium" })}
					</span>
					{isOpen ? (
						<Button size="sm" onClick={onSubmit}>
							Submit
						</Button>
					) : (
						<Badge
							variant={
								task.status === "COMPLETED"
									? "success"
									: "outline"
							}
						>
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
	const [resolutionCode, setResolutionCode] = useState("no_problem");
	const [note, setNote] = useState("");
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	// Items used during the visit are recorded but never required (PM spec)
	const [lines, setLines] = useState<InstallLine[]>([]);

	const installedItems = linesToPayload(lines).filter(
		(l): l is { stockItemId: string; quantity: number; price: number } =>
			"stockItemId" in l,
	);

	async function handleSubmit() {
		if (!organizationId) {
			return;
		}
		if (resolutionCode === "custom" && !note.trim()) {
			toast.error("A note is required for 'Other'");
			return;
		}
		try {
			await complete.mutateAsync({
				organizationId,
				taskId: task.id,
				resolutionCode: resolutionCode as never,
				resolutionNote: note.trim() || undefined,
				photoUrl: photoUrl ?? undefined,
				...(installedItems.length > 0 ? { installedItems } : {}),
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
			onClose={onClose}
			onSubmit={handleSubmit}
		>
			<div className="space-y-1.5">
				<Label>What did you find?</Label>
				<Combobox
					value={resolutionCode}
					onChange={setResolutionCode}
					searchPlaceholder="Search…"
					options={TASK_RESOLUTION_OPTIONS.map((opt) => ({
						value: opt.value,
						label: opt.label,
					}))}
				/>
			</div>
			<div className="space-y-1.5">
				<Label htmlFor="maint-note">
					Note{resolutionCode === "custom" ? " *" : ""}
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
				<Label>Items used (optional)</Label>
				<InstallItemRows
					lines={lines}
					onChange={setLines}
					allowAddons={false}
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
	const [lines, setLines] = useState<InstallLine[]>([]);
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);

	const installedItems = linesToPayload(lines).filter(
		(l): l is { stockItemId: string; quantity: number; price: number } =>
			"stockItemId" in l,
	);
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
					allowAddons={false}
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
	const [lines, setLines] = useState<InstallLine[]>([]);
	const [photoUrl, setPhotoUrl] = useState<string | null>(null);
	const [recovered, setRecovered] = useState<RecoveredItem[]>([
		newRecoveredItem(1),
	]);

	const installedItems = linesToPayload(lines).filter(
		(l): l is { stockItemId: string; quantity: number; price: number } =>
			"stockItemId" in l,
	);
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
					allowAddons={false}
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
		itemName: "",
		quantity: 1,
		pictureUrl: null,
	};
}

function recoveredItemsValid(items: RecoveredItem[]): boolean {
	return (
		items.length > 0 &&
		items.every(
			(item) =>
				(item.stockItemId || item.itemName.trim()) &&
				item.quantity >= 1 &&
				item.pictureUrl !== null,
		)
	);
}

function recoveredItemsPayload(items: RecoveredItem[]) {
	return items.map((item) => ({
		stockItemId: item.stockItemId ?? undefined,
		itemName: item.itemName.trim() || undefined,
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
	const { allocations } = useMyStockQuery();

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
							value={item.stockItemId ?? "custom"}
							searchPlaceholder="Search my stock…"
							onChange={(v) =>
								updateItem(item.key, {
									stockItemId: v === "custom" ? null : v,
								})
							}
							options={[
								{
									value: "custom",
									label: "Other / type a name",
								},
								...allocations.map((alloc) => ({
									value: alloc.stockItem.id,
									label: alloc.stockItem.name,
								})),
							]}
						/>
						{!item.stockItemId && (
							<Input
								value={item.itemName}
								onChange={(e) =>
									updateItem(item.key, {
										itemName: e.target.value,
									})
								}
								placeholder="Item name"
							/>
						)}
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
				Add another item
			</Button>
		</div>
	);
}
