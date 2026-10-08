"use client";

import {
	FIBER_BOX_LABELS,
	FIBER_BOX_STATUSES,
	FIBER_LOST_REASON_LABELS,
	FIBER_LOST_REASONS,
	FIBER_SOURCE_LABELS,
	FIBER_STAGE_HINTS,
	FIBER_STAGE_LABELS,
	FIBER_STAGES,
	type FiberBoxStatus,
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
	CheckIcon,
	ExternalLinkIcon,
	MessageCircleIcon,
	PhoneIcon,
	XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	type FiberLeadDetail,
	useFiberLead,
	useLogFiberContact,
	useUpdateFiberLead,
} from "../hooks/use-fiber";
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
				className="w-full overflow-y-auto sm:max-w-lg"
			>
				{isLoading || !data ? (
					<div className="space-y-3 p-4">
						<Skeleton className="h-8 w-2/3" />
						<Skeleton className="h-24 w-full" />
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

// react-doctor-disable-next-line react-doctor/no-giant-component -- one lead's working surface: contact, next step, follow-up, box check and timeline share the same lead + mutations
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
	const [lostReason, setLostReason] = useState<FiberLostReason>("OGERO");

	const stage = lead.stage as FiberStage;
	const closed = stage === "WON" || stage === "LOST";
	const nextStage = closed
		? null
		: (OPEN_FIBER_STAGES[OPEN_FIBER_STAGES.indexOf(stage) + 1] ?? "WON");
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

	function save(patch: LeadPatch, success?: string) {
		update.mutate(
			{ organizationId, id: lead.id, ...patch },
			{
				onSuccess: () => success && toast.success(success),
				onError: (e) => toast.error(e.message),
			},
		);
	}

	function logContact(type: "CALL" | "WHATSAPP" | "NOTE", body?: string) {
		log.mutate(
			{ organizationId, id: lead.id, type, ...(body ? { body } : {}) },
			{
				onSuccess: () => {
					if (type === "NOTE") {
						setNote("");
					}
					toast.success(type === "NOTE" ? "Note saved" : "Logged");
				},
				onError: (e) => toast.error(e.message),
			},
		);
	}

	return (
		<div className="space-y-5 p-4">
			<SheetHeader className="p-0">
				<SheetTitle className="flex flex-wrap items-center gap-2 text-left">
					{name}
					<StageBadge stage={stage} />
				</SheetTitle>
				<p className="text-left text-xs text-muted-foreground">
					{[
						lead.customer?.username,
						lead.area,
						FIBER_SOURCE_LABELS[lead.source as FiberSource],
						`since ${formatDate(lead.createdAt)}`,
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
				<div className="flex flex-wrap gap-2 pt-1">
					{lead.customer && (
						<Button variant="outline" size="sm" asChild>
							<Link
								to="/app/$organizationSlug/customers/$customerId"
								params={{
									organizationSlug,
									customerId: lead.customer.id,
								}}
							>
								Customer <ExternalLinkIcon />
							</Link>
						</Button>
					)}
					{lead.conversationId && (
						<Button variant="outline" size="sm" asChild>
							<Link
								to="/app/$organizationSlug/conversations/$conversationId"
								params={{
									organizationSlug,
									conversationId: lead.conversationId,
								}}
							>
								Chat <MessageCircleIcon />
							</Link>
						</Button>
					)}
					{lead.taskId && (
						<Button variant="outline" size="sm" asChild>
							<Link
								to="/app/$organizationSlug/escalations/$taskId"
								params={{
									organizationSlug,
									taskId: lead.taskId,
								}}
							>
								Escalation <ExternalLinkIcon />
							</Link>
						</Button>
					)}
				</div>
			</SheetHeader>

			{/* Contact */}
			{phones.length > 0 && (
				<section className="space-y-2">
					<div className="flex gap-2">
						<PhoneActions numbers={phones} tone="colored" />
					</div>
					{canManage && (
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="flex-1"
								disabled={log.isPending}
								onClick={() => logContact("CALL")}
							>
								<PhoneIcon /> I called them
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="flex-1"
								disabled={log.isPending}
								onClick={() => logContact("WHATSAPP")}
							>
								<MessageCircleIcon /> I messaged them
							</Button>
						</div>
					)}
				</section>
			)}

			{/* Next step */}
			{canManage && (
				<section className="space-y-2 rounded-lg border p-3">
					<p className="text-sm font-medium">Next step</p>
					<p className="text-xs text-muted-foreground">
						{FIBER_STAGE_HINTS[stage]}
					</p>
					{!closed && nextStage && !losing && (
						<div className="grid grid-cols-2 gap-2">
							<Button
								className="col-span-2 h-11"
								disabled={update.isPending}
								onClick={() =>
									save(
										{ stage: nextStage },
										`Moved to ${FIBER_STAGE_LABELS[nextStage]}`,
									)
								}
							>
								{FIBER_STAGE_LABELS[nextStage]}{" "}
								<ArrowRightIcon />
							</Button>
							<Button
								variant="success-soft"
								disabled={update.isPending}
								onClick={() => save({ stage: "WON" }, "Won 🎉")}
							>
								<CheckIcon /> Won
							</Button>
							<Button
								variant="destructive-soft"
								onClick={() => setLosing(true)}
							>
								<XIcon /> Lost
							</Button>
						</div>
					)}
					{losing && (
						<div className="space-y-2">
							<Label className="text-xs">Why?</Label>
							<div className="flex flex-wrap gap-1.5">
								{FIBER_LOST_REASONS.map((r) => (
									<Button
										key={r}
										size="sm"
										variant={
											lostReason === r
												? "primary"
												: "outline"
										}
										onClick={() => setLostReason(r)}
									>
										{FIBER_LOST_REASON_LABELS[r]}
									</Button>
								))}
							</div>
							<div className="flex gap-2">
								<Button
									variant="ghost"
									className="flex-1"
									onClick={() => setLosing(false)}
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									className="flex-1"
									disabled={update.isPending}
									onClick={() => {
										setLosing(false);
										save(
											{ stage: "LOST", lostReason },
											"Marked lost",
										);
									}}
								>
									Mark lost
								</Button>
							</div>
						</div>
					)}
					{closed && (
						<div className="flex items-center justify-between gap-2 text-sm">
							<span>
								{stage === "WON"
									? `Won ${lead.wonAt ? formatDate(lead.wonAt) : ""}`
									: `Lost — ${FIBER_LOST_REASON_LABELS[lead.lostReason as FiberLostReason] ?? "no reason"}`}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									save({ stage: "CONTACTED" }, "Reopened")
								}
							>
								Reopen
							</Button>
						</div>
					)}
					<Select
						value={stage}
						onValueChange={(v) => {
							if (v === "LOST") {
								setLosing(true);
							} else {
								save({ stage: v as FiberStage });
							}
						}}
					>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{FIBER_STAGES.map((s) => (
								<SelectItem key={s} value={s}>
									Jump to: {FIBER_STAGE_LABELS[s]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</section>
			)}

			{/* Follow-up + owner */}
			{canManage && !closed && (
				<section className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label className="text-xs">Follow up on</Label>
						<Input
							type="date"
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
						<div className="flex gap-1">
							{[
								["Tomorrow", 1],
								["3 days", 3],
								["1 week", 7],
							].map(([label, days]) => (
								<Button
									key={label}
									size="sm"
									variant="ghost"
									className="h-7 px-2 text-xs"
									onClick={() =>
										save(
											{
												nextActionAt: beirutDayAt(
													new Date(),
													days as number,
													"10:00",
												),
											},
											"Follow-up set",
										)
									}
								>
									{label}
								</Button>
							))}
						</div>
					</div>
					<div className="space-y-1.5">
						<Label className="text-xs">Who handles it</Label>
						<Select
							value={lead.assignee?.id ?? "none"}
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
					</div>
				</section>
			)}

			{/* Ogero box + threat */}
			<section className="space-y-3 rounded-lg border p-3">
				<p className="text-sm font-medium">Fiber box</p>
				<div className="grid grid-cols-3 gap-1.5">
					{FIBER_BOX_STATUSES.map((s) => (
						<Button
							key={s}
							size="sm"
							variant={
								lead.boxStatus === s ? "primary" : "outline"
							}
							disabled={!canManage}
							onClick={() =>
								save({ boxStatus: s as FiberBoxStatus })
							}
							className="h-auto min-h-8 whitespace-normal text-xs"
						>
							{FIBER_BOX_LABELS[s]}
						</Button>
					))}
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					<div className="space-y-1">
						<Label className="text-xs">Code on the box</Label>
						<Input
							key={lead.boxCode ?? ""}
							defaultValue={lead.boxCode ?? ""}
							disabled={!canManage}
							placeholder="e.g. RNB F20 079"
							onBlur={(e) =>
								e.target.value !== (lead.boxCode ?? "") &&
								save({ boxCode: e.target.value || null })
							}
						/>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Ogero request no.</Label>
						<Input
							key={lead.ogeroRequestRef ?? ""}
							defaultValue={lead.ogeroRequestRef ?? ""}
							disabled={!canManage}
							placeholder="From the providers portal"
							onBlur={(e) =>
								e.target.value !==
									(lead.ogeroRequestRef ?? "") &&
								save({
									ogeroRequestRef: e.target.value || null,
								})
							}
						/>
					</div>
				</div>
				<label
					htmlFor="fiber-ogero-approached"
					className="flex items-center justify-between gap-3 text-sm"
				>
					<span>
						Ogero already approached them
						<span className="block text-xs text-muted-foreground">
							Pre-contract, visit or call from Ogero / its
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
			</section>

			{lead.customer && (
				<section className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-xs">
					<Fact label="Plan" value={lead.customer.plan?.name} />
					<Fact
						label="Pays"
						value={
							lead.customer.monthlyRate != null
								? `${formatCurrency(lead.customer.monthlyRate)}/mo`
								: null
						}
					/>
					<Fact
						label="Landline"
						value={
							lead.customer.landline
								? formatLebaneseLandline(lead.customer.landline)
								: lead.customer.hasLandline === false
									? "None"
									: "Not asked"
						}
					/>
					<Fact label="Status" value={lead.customer.status} />
				</section>
			)}

			{/* Notes + timeline */}
			<section className="space-y-2">
				{canManage && (
					<div className="space-y-2">
						<Textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="What did they say? Price they pay elsewhere, best time to call…"
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
				<ol className="space-y-3 border-l pl-4">
					{activities.map((a) => (
						<li key={a.id} className="relative">
							<span
								className={cn(
									"absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background",
									a.type === "SIGNAL"
										? "bg-warning"
										: a.type === "STAGE"
											? "bg-primary"
											: "bg-muted-foreground/50",
								)}
							/>
							<p className="text-sm whitespace-pre-wrap">
								{a.body}
							</p>
							<p className="text-[11px] text-muted-foreground">
								{a.type === "SIGNAL"
									? "Detected automatically"
									: (a.actorName ?? "System")}{" "}
								· {formatDateTime(a.createdAt)}
							</p>
						</li>
					))}
				</ol>
			</section>
		</div>
	);
}

function Fact({
	label,
	value,
}: {
	label: string;
	value: string | null | undefined;
}) {
	return (
		<div>
			<p className="text-muted-foreground">{label}</p>
			<p className="font-medium">{value || "—"}</p>
		</div>
	);
}
