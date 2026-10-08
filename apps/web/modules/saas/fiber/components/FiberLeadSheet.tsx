"use client";

import {
	FIBER_BOX_LABELS,
	FIBER_BOX_STATUSES,
	FIBER_LOST_REASON_LABELS,
	FIBER_LOST_REASONS,
	FIBER_NEXT_STEP,
	FIBER_SOURCE_LABELS,
	FIBER_STAGE_HINTS,
	FIBER_STAGE_LABELS,
	type FiberLostReason,
	type FiberSource,
	type FiberStage,
	OPEN_FIBER_STAGES,
} from "@repo/api/modules/fiber/lib/constants";
import { beirutDayAt, formatLebaneseLandline, toE164 } from "@repo/utils";
import { useEmployeesQuery } from "@saas/employees/client";
import { PhoneActions } from "@shared/components/PhoneActions";
import { customerPhoneNumbers } from "@shared/lib/customer-phones";
import { displayName } from "@shared/lib/display-name";
import {
	beirutWallClockToUtc,
	formatCurrency,
	formatDate,
	formatDateInput,
	formatDateTime,
} from "@shared/lib/format";
import { useOrganizationId } from "@shared/lib/organization";
import { Link } from "@tanstack/react-router";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@ui/components/sheet";
import { Skeleton } from "@ui/components/skeleton";
import { Switch } from "@ui/components/switch";
import { Textarea } from "@ui/components/textarea";
import { cn } from "@ui/lib";
import {
	ArrowRightIcon,
	BotIcon,
	CheckIcon,
	MessageCircleIcon,
	PhoneMissedIcon,
	UserIcon,
	XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
	type FiberLeadDetail,
	useFiberLead,
	useLogFiberContact,
	useUpdateFiberLead,
} from "../hooks/use-fiber";
import { LeadReason } from "./LeadReason";
import { StageBadge } from "./StageBadge";

interface FiberLeadSheetProps {
	leadId: string | null;
	organizationSlug: string;
	canManage: boolean;
	onClose: () => void;
}

export function FiberLeadSheet({
	leadId,
	organizationSlug,
	canManage,
	onClose,
}: FiberLeadSheetProps) {
	const { data, isLoading } = useFiberLead(leadId);
	return (
		<Sheet open={!!leadId} onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-xl"
			>
				{isLoading || !data ? (
					<div className="space-y-3 p-4">
						<Skeleton className="h-8 w-2/3" />
						<Skeleton className="h-32 w-full" />
						<Skeleton className="h-40 w-full" />
					</div>
				) : (
					// Remount per lead so local inputs start from that lead's values.
					<LeadBody
						key={data.lead.id}
						data={data}
						organizationSlug={organizationSlug}
						canManage={canManage}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

type LeadPatch = Omit<
	Parameters<ReturnType<typeof useUpdateFiberLead>["mutate"]>[0],
	"organizationId" | "id"
>;

const FOLLOW_UP_CHIPS: Array<[string, number]> = [
	["Tomorrow", 1],
	["In 3 days", 3],
	["In a week", 7],
];

/**
 * One lead, laid out in the order an admin needs it: who this is, WHY they
 * are in the pipeline (their own words), how to reach them, what to do next,
 * then the details and the history.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- one lead's working surface: reason, contact, next step, details and history share the same lead + mutations
function LeadBody({
	data,
	organizationSlug,
	canManage,
}: {
	data: FiberLeadDetail;
	organizationSlug: string;
	canManage: boolean;
}) {
	const { lead, activities } = data;
	const organizationId = useOrganizationId() ?? "";
	const update = useUpdateFiberLead();
	const log = useLogFiberContact();
	const { employees } = useEmployeesQuery();
	const [note, setNote] = useState("");
	const [losing, setLosing] = useState(false);
	const busy = update.isPending || log.isPending;

	const stage = lead.stage as FiberStage;
	const closed = stage === "WON" || stage === "LOST";
	const next = closed
		? null
		: FIBER_NEXT_STEP[stage as keyof typeof FIBER_NEXT_STEP];
	const step = OPEN_FIBER_STAGES.indexOf(stage as never) + 1;
	const name =
		lead.name ||
		displayName(lead.customer?.firstName, lead.customer?.lastName, {
			fallback: "Unnamed chat",
		});
	// The customer's own list (landline included — calling it is fine), or
	// the number the lead came in on.
	const phones = lead.customer
		? customerPhoneNumbers(lead.customer)
		: lead.phone
			? [toE164(lead.phone)]
			: [];
	const signals = activities.filter((a) => a.type === "SIGNAL");
	const history = activities.filter((a) => a.type !== "SIGNAL");

	function save(patch: LeadPatch, success?: string) {
		update.mutate(
			{ organizationId, id: lead.id, ...patch },
			{
				onSuccess: () => success && toast.success(success),
				onError: (e) => toast.error(e.message),
			},
		);
	}

	function logContact(
		type: "CALL" | "WHATSAPP" | "NOTE",
		body?: string,
		then?: () => void,
	) {
		log.mutate(
			{ organizationId, id: lead.id, type, ...(body ? { body } : {}) },
			{
				onSuccess: () => {
					if (type === "NOTE") {
						setNote("");
					}
					if (then) {
						then();
					} else {
						toast.success(
							type === "NOTE" ? "Note saved" : "Logged",
						);
					}
				},
				onError: (e) => toast.error(e.message),
			},
		);
	}

	return (
		<div className="space-y-5 p-4">
			{/* Who */}
			<SheetHeader className="space-y-1 p-0 text-left">
				<SheetTitle className="flex flex-wrap items-center gap-2">
					{name}
					<StageBadge stage={stage} />
				</SheetTitle>
				<p className="text-sm text-muted-foreground">
					{lead.customer ? (
						<>
							Existing customer
							{lead.customer.plan?.name
								? ` · ${lead.customer.plan.name}`
								: ""}
							{lead.customer.monthlyRate != null
								? ` · pays ${formatCurrency(lead.customer.monthlyRate)}/mo`
								: ""}
						</>
					) : (
						"Not linked to a customer account yet"
					)}
					{lead.area ? (
						<span className="capitalize"> · {lead.area}</span>
					) : null}
				</p>
				{lead.customer?.plan?.isFiber && (
					<p className="text-sm font-medium text-success">
						Already on a fiber plan.
					</p>
				)}
				<p className="text-xs text-muted-foreground">
					{FIBER_SOURCE_LABELS[lead.source as FiberSource] ??
						lead.source}{" "}
					· in the pipeline since {formatDate(lead.createdAt)}
					{lead.ogeroApproached
						? " · Ogero already approached them"
						: ""}
				</p>
			</SheetHeader>

			{/* Why — the reason and the words behind it */}
			<LeadReason
				summary={lead.summary}
				signals={signals}
				fallback={
					lead.notes ||
					"Added by staff — no message from the customer is attached."
				}
			/>
			<div className="flex flex-wrap gap-2">
				{lead.conversationId && (
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/app/$organizationSlug/conversations/$conversationId"
							params={{
								organizationSlug,
								conversationId: lead.conversationId,
							}}
						>
							<MessageCircleIcon /> Read the whole chat
						</Link>
					</Button>
				)}
				{lead.taskId && (
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/app/$organizationSlug/escalations/$taskId"
							params={{ organizationSlug, taskId: lead.taskId }}
						>
							<BotIcon /> Open the bot's ticket
						</Link>
					</Button>
				)}
				{lead.customer && (
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/app/$organizationSlug/customers/$customerId"
							params={{
								organizationSlug,
								customerId: lead.customer.id,
							}}
						>
							<UserIcon /> Customer page
						</Link>
					</Button>
				)}
			</div>

			{/* Reach them */}
			<Section title="Reach them">
				{phones.length > 0 ? (
					<div className="flex gap-2">
						<PhoneActions numbers={phones} tone="colored" />
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						No phone number on this lead
						{lead.conversationId
							? " — reply in the chat instead."
							: "."}
					</p>
				)}
				{lead.customer && (
					<p className="text-xs text-muted-foreground">
						Landline:{" "}
						{lead.customer.landline
							? formatLebaneseLandline(lead.customer.landline)
							: lead.customer.hasLandline === false
								? "none"
								: "not asked yet"}
					</p>
				)}
			</Section>

			{/* What to do next */}
			{canManage && (
				<Section
					title={
						closed
							? "Outcome"
							: `What to do now — step ${step} of 6`
					}
				>
					{!closed && (
						<div className="flex gap-1" aria-hidden>
							{OPEN_FIBER_STAGES.map((s, i) => (
								<span
									key={s}
									title={FIBER_STAGE_LABELS[s]}
									className={cn(
										"h-1.5 flex-1 rounded-full",
										i < step ? "bg-primary" : "bg-muted",
									)}
								/>
							))}
						</div>
					)}
					<p className="text-sm">{FIBER_STAGE_HINTS[stage]}</p>

					{next && !losing && (
						<div className="grid gap-2 sm:grid-cols-2">
							<Button
								className="h-11 sm:col-span-2"
								disabled={busy}
								onClick={() =>
									save(
										{ stage: next.to },
										`Moved to ${FIBER_STAGE_LABELS[next.to]}`,
									)
								}
							>
								<CheckIcon /> {next.label} <ArrowRightIcon />
							</Button>
							<Button
								variant="outline"
								disabled={busy}
								onClick={() =>
									logContact(
										"CALL",
										"Called — no answer",
										() =>
											save(
												{
													nextActionAt: beirutDayAt(
														new Date(),
														1,
														"10:00",
													),
												},
												"Logged — reminder set for tomorrow",
											),
									)
								}
							>
								<PhoneMissedIcon /> No answer — try tomorrow
							</Button>
							<Button
								variant="destructive-soft"
								onClick={() => setLosing(true)}
							>
								<XIcon /> Not going ahead…
							</Button>
						</div>
					)}

					{losing && (
						<div className="space-y-2">
							<p className="text-sm font-medium">
								What happened?
							</p>
							<div className="grid grid-cols-2 gap-1.5">
								{FIBER_LOST_REASONS.map((reason) => (
									<Button
										key={reason}
										size="sm"
										variant="outline"
										disabled={busy}
										onClick={() => {
											setLosing(false);
											save(
												{
													stage: "LOST",
													lostReason: reason,
												},
												"Closed",
											);
										}}
									>
										{FIBER_LOST_REASON_LABELS[reason]}
									</Button>
								))}
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setLosing(false)}
							>
								Cancel
							</Button>
						</div>
					)}

					{closed && (
						<div className="flex items-center justify-between gap-2 text-sm">
							<span>
								{stage === "WON"
									? `Won${lead.wonAt ? ` on ${formatDate(lead.wonAt)}` : ""}`
									: `Closed: ${FIBER_LOST_REASON_LABELS[lead.lostReason as FiberLostReason] ?? "no reason given"}`}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() =>
									save({ stage: "CONTACTED" }, "Reopened")
								}
							>
								Reopen
							</Button>
						</div>
					)}

					{!closed && (
						<div className="flex flex-wrap items-center gap-2 border-t pt-3">
							<Label className="text-xs">Remind me on</Label>
							<Input
								type="date"
								className="h-8 w-40"
								value={
									lead.nextActionAt
										? formatDateInput(lead.nextActionAt)
										: ""
								}
								onChange={(e) =>
									save({
										// 10:00 Beirut, whatever the device's timezone.
										nextActionAt: e.target.value
											? beirutWallClockToUtc(
													`${e.target.value}T10:00`,
												)
											: null,
									})
								}
							/>
							{FOLLOW_UP_CHIPS.map(([label, days]) => (
								<Button
									key={label}
									size="sm"
									variant="ghost"
									className="h-8 px-2 text-xs"
									onClick={() =>
										save(
											{
												nextActionAt: beirutDayAt(
													new Date(),
													days,
													"10:00",
												),
											},
											"Reminder set",
										)
									}
								>
									{label}
								</Button>
							))}
						</div>
					)}
				</Section>
			)}

			{/* Details */}
			<Section title="Details">
				<div className="grid gap-3 sm:grid-cols-2">
					<Field label="Who handles it">
						<Select
							value={lead.assignee?.id ?? "none"}
							disabled={!canManage}
							onValueChange={(v) =>
								save({ assigneeId: v === "none" ? null : v })
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Nobody yet</SelectItem>
								{employees.map((e) => (
									<SelectItem key={e.id} value={e.id}>
										{e.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field label="Fiber box in the building">
						<Select
							value={lead.boxStatus}
							disabled={!canManage}
							onValueChange={(v) =>
								save({
									boxStatus:
										v as (typeof FIBER_BOX_STATUSES)[number],
								})
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{FIBER_BOX_STATUSES.map((s) => (
									<SelectItem key={s} value={s}>
										{FIBER_BOX_LABELS[s]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Field label="Code written on the box">
						<Input
							key={lead.boxCode ?? ""}
							defaultValue={lead.boxCode ?? ""}
							disabled={!canManage}
							placeholder="e.g. DKW F15 078"
							onBlur={(e) =>
								e.target.value !== (lead.boxCode ?? "") &&
								save({ boxCode: e.target.value || null })
							}
						/>
					</Field>
					<Field label="Ogero request number">
						<Input
							key={lead.ogeroRequestRef ?? ""}
							defaultValue={lead.ogeroRequestRef ?? ""}
							disabled={!canManage}
							placeholder="From the Ogero portal"
							onBlur={(e) =>
								e.target.value !==
									(lead.ogeroRequestRef ?? "") &&
								save({
									ogeroRequestRef: e.target.value || null,
								})
							}
						/>
					</Field>
				</div>
				<label
					htmlFor="fiber-ogero-approached"
					className="flex items-center justify-between gap-3 text-sm"
				>
					<span>
						Ogero already approached them
						<span className="block text-xs text-muted-foreground">
							A visit, a call or a pre-contract from Ogero or its
							contractor
						</span>
					</span>
					<Switch
						id="fiber-ogero-approached"
						checked={lead.ogeroApproached}
						disabled={!canManage}
						onCheckedChange={(v) => save({ ogeroApproached: v })}
					/>
				</label>
			</Section>

			{/* Notes + what the team did */}
			<Section title="Notes and history">
				{canManage && (
					<div className="space-y-2">
						<Textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="What did they say? What they pay elsewhere, best time to call…"
							rows={2}
							className="resize-none"
						/>
						<Button
							size="sm"
							variant="outline"
							disabled={!note.trim() || log.isPending}
							onClick={() => logContact("NOTE", note.trim())}
						>
							Save note
						</Button>
					</div>
				)}
				{history.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nobody on the team has touched this lead yet.
					</p>
				) : (
					<ol className="space-y-3 border-l pl-4">
						{history.map((a) => (
							<li key={a.id} className="relative">
								<span
									className={cn(
										"absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background",
										a.type === "STAGE"
											? "bg-primary"
											: "bg-muted-foreground/50",
									)}
								/>
								<p
									className="whitespace-pre-wrap text-sm"
									dir="auto"
								>
									{a.body}
								</p>
								<p className="text-[11px] text-muted-foreground">
									{a.actorName ?? "Automatic"} ·{" "}
									{formatDateTime(a.createdAt)}
								</p>
							</li>
						))}
					</ol>
				)}
			</Section>
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-3 rounded-lg border p-4">
			<h3 className="text-sm font-semibold">{title}</h3>
			{children}
		</section>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="space-y-1.5">
			<Label className="text-xs">{label}</Label>
			{children}
		</div>
	);
}
