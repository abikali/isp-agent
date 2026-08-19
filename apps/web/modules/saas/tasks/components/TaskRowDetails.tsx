"use client";

import { useWorkerOptions } from "@saas/worker-options/client";
import { ImageViewerDialog } from "@shared/components/ImageViewerDialog";
import { PhoneActions } from "@shared/components/PhoneActions";
import { customerPhoneNumbers } from "@shared/lib/customer-phones";
import { displayName } from "@shared/lib/display-name";
import { formatDate, formatDateTime } from "@shared/lib/format";
import { Link } from "@tanstack/react-router";
import { Badge } from "@ui/components/badge";
import { Button } from "@ui/components/button";
import {
	CalendarClockIcon,
	CheckCircle2Icon,
	ClipboardListIcon,
	ImageIcon,
	MapPinIcon,
	PackageMinusIcon,
	PackagePlusIcon,
	PhoneIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { TaskListItem } from "../hooks/use-tasks";
import { FOLLOW_UP_STATUS_LABELS, TASK_SOURCE_LABELS } from "../lib/constants";

const ITEM_STATUS_VARIANTS: Record<
	string,
	"info" | "success" | "error" | "outline"
> = {
	PENDING: "info",
	APPROVED: "success",
	DENIED: "error",
	COMPLETED: "success",
};

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon: typeof UserIcon;
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				<Icon className="size-3.5" />
				{title}
			</div>
			<div className="space-y-1 text-sm">{children}</div>
		</div>
	);
}

function Field({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-right text-sm font-medium">{value}</span>
		</div>
	);
}

export function TaskRowDetails({
	task,
	organizationSlug,
}: {
	task: TaskListItem;
	organizationSlug: string;
}) {
	const [photo, setPhoto] = useState<{ src: string; title: string } | null>(
		null,
	);
	const { labelOf: resolutionLabel } = useWorkerOptions("TASK_RESOLUTION");

	const customer = task.customer;
	// Every number on file, not just the primary — see PhoneActions.
	const phoneNumbers = customerPhoneNumbers(customer);
	const installs = task.installations ?? [];
	const recovered = task.uninstalledItems ?? [];
	const hasCompletion =
		!!task.completedByEmployee ||
		!!task.completedAt ||
		!!task.resolutionCode ||
		!!task.resolutionNote ||
		!!task.completionPhotoUrl;

	return (
		<div className="border-t border-border px-4 py-4 sm:px-6">
			{(task.description || task.notes) && (
				<div className="mb-4 space-y-2">
					{task.description && (
						<p className="whitespace-pre-wrap text-sm leading-relaxed">
							{task.description}
						</p>
					)}
					{task.notes && (
						<div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
							{task.notes}
						</div>
					)}
				</div>
			)}

			<div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
				{/* Customer / target */}
				{(customer || task.base || task.station) && (
					<Section
						icon={UserIcon}
						title={customer ? "Customer" : "Target"}
					>
						{customer ? (
							<>
								<Link
									to="/app/$organizationSlug/customers/$customerId"
									params={{
										organizationSlug,
										customerId: customer.id,
									}}
									className="font-medium hover:underline"
									preload="intent"
								>
									{displayName(
										customer.firstName,
										customer.lastName,
									)}
								</Link>
								<div className="space-y-0.5 text-xs text-muted-foreground">
									{customer.accountNumber && (
										<div className="font-mono">
											#{customer.accountNumber}
										</div>
									)}
									{phoneNumbers.map((number) => (
										<div
											key={number}
											className="flex items-center gap-1"
										>
											<PhoneIcon className="size-3" />
											{number}
										</div>
									))}
									{customer.address && (
										<div className="flex items-start gap-1">
											<MapPinIcon className="mt-0.5 size-3 shrink-0" />
											{customer.address}
										</div>
									)}
								</div>
								{phoneNumbers.length > 0 && (
									<div className="flex flex-wrap gap-2 pt-1">
										<PhoneActions
											numbers={phoneNumbers}
											className="basis-24"
										/>
									</div>
								)}
							</>
						) : (
							<div className="space-y-0.5">
								<div className="font-medium">
									{task.base?.name ?? task.station?.name}
								</div>
								{(task.base?.address ?? task.station?.name) && (
									<div className="text-xs text-muted-foreground">
										{task.base?.address ??
											task.station?.name}
									</div>
								)}
							</div>
						)}
					</Section>
				)}

				{/* People */}
				<Section icon={UsersIcon} title="Workers">
					<Field
						label="Created by"
						value={task.createdBy?.name ?? "System"}
					/>
					{task.assignments.length > 0 ? (
						<div className="space-y-1 pt-1">
							{task.assignments.map((a) => (
								<div
									key={a.employee.id}
									className="flex items-center justify-between gap-2"
								>
									<span>{a.employee.name}</span>
									{a.employee.position && (
										<span className="text-xs text-muted-foreground">
											{a.employee.position}
										</span>
									)}
								</div>
							))}
						</div>
					) : (
						<p className="text-xs text-muted-foreground">
							No worker assigned yet.
						</p>
					)}
					{task.completedByEmployee && (
						<div className="flex items-center gap-1.5 pt-1 text-emerald-600 dark:text-emerald-400">
							<CheckCircle2Icon className="size-3.5" />
							<span className="text-sm font-medium">
								Done by {task.completedByEmployee.name}
							</span>
						</div>
					)}
				</Section>

				{/* Timeline */}
				<Section icon={CalendarClockIcon} title="Timeline">
					<Field label="Created" value={formatDate(task.createdAt)} />
					{task.dueDate && (
						<Field label="Due" value={formatDate(task.dueDate)} />
					)}
					{task.completedAt && (
						<Field
							label="Completed"
							value={formatDateTime(task.completedAt)}
						/>
					)}
					<Field
						label="Source"
						value={TASK_SOURCE_LABELS[task.source] ?? task.source}
					/>
					{task.followUpStatus && (
						<Field
							label="Follow-up"
							value={
								FOLLOW_UP_STATUS_LABELS[task.followUpStatus] ??
								task.followUpStatus
							}
						/>
					)}
				</Section>

				{/* Items used */}
				{installs.length > 0 && (
					<Section icon={PackagePlusIcon} title="Items used">
						{installs.map((item) => (
							<div
								key={item.id}
								className="flex items-center justify-between gap-2"
							>
								<span>
									{item.stockItem?.name ?? "Item"}
									<span className="text-muted-foreground">
										{" "}
										×{item.quantity}
									</span>
								</span>
								<Badge
									variant={
										ITEM_STATUS_VARIANTS[item.status] ??
										"outline"
									}
									className="text-[10px]"
								>
									{item.status.toLowerCase()}
								</Badge>
							</div>
						))}
					</Section>
				)}

				{/* Recovered equipment */}
				{recovered.length > 0 && (
					<Section icon={PackageMinusIcon} title="Recovered">
						{recovered.map((item) => (
							<div
								key={item.id}
								className="flex items-center justify-between gap-2"
							>
								<span>
									{item.itemName}
									<span className="text-muted-foreground">
										{" "}
										×{item.quantity}
									</span>
								</span>
								<Badge
									variant={
										ITEM_STATUS_VARIANTS[item.status] ??
										"outline"
									}
									className="text-[10px]"
								>
									{item.status.toLowerCase()}
								</Badge>
							</div>
						))}
					</Section>
				)}

				{/* Completion evidence */}
				{hasCompletion && (
					<Section
						icon={ClipboardListIcon}
						title="Completion evidence"
					>
						{task.resolutionCode && (
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground">
									Resolution
								</span>
								<Badge
									variant="outline"
									className="text-[10px]"
								>
									{resolutionLabel(task.resolutionCode)}
								</Badge>
							</div>
						)}
						{task.resolutionNote && (
							<p className="rounded-md bg-muted/40 p-2 text-xs">
								{task.resolutionNote}
							</p>
						)}
						{task.completionPhotoUrl && (
							<Button
								variant="outline"
								size="sm"
								className="h-7"
								onClick={() =>
									setPhoto({
										src: task.completionPhotoUrl as string,
										title: "Completion photo",
									})
								}
							>
								<ImageIcon className="mr-1.5 size-3.5" />
								View photo
							</Button>
						)}
					</Section>
				)}
			</div>

			{photo && (
				<ImageViewerDialog
					open={!!photo}
					onOpenChange={(open) => {
						if (!open) {
							setPhoto(null);
						}
					}}
					src={photo.src}
					title={photo.title}
				/>
			)}
		</div>
	);
}
