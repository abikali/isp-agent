"use client";

import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Switch } from "@ui/components/switch";
import { LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentRemindersSettings } from "./PaymentRemindersSettings";

export function NotificationSettings() {
	const organizationId = useOrganizationId();
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery(
		organizationId
			? orpc.organizations.getNotificationSettings.queryOptions({
					input: { organizationId },
				})
			: disabledQuery(["organizations", "getNotificationSettings"]),
	);

	const update = useMutation({
		...orpc.organizations.updateNotificationSettings.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.organizations.getNotificationSettings.key(),
			});
		},
	});

	const onToggle = (
		field:
			| "stoppedPaymentTaskEnabled"
			| "stoppedPaymentNotifyEnabled"
			| "alertOnWorkerRequest"
			| "alertOnPaymentCollected"
			| "alertOnInstallationDone"
			| "notifyWorkerOnTaskAssigned"
			| "notifyWorkerOnTaskUpdated"
			| "notifyWorkerOnTaskCancelled"
			| "notifyWorkerOnTaskReminder"
			| "collectorCountsFree"
			| "collectorCountsStop",
		checked: boolean,
	) => {
		if (!organizationId) {
			return;
		}
		update.mutate({ organizationId, [field]: checked });
	};

	const [chatIdDraft, setChatIdDraft] = useState<string | null>(null);
	const savedChatId = data?.adminTelegramChatId ?? "";
	const chatIdValue = chatIdDraft ?? savedChatId;
	const saveChatId = () => {
		if (!organizationId || chatIdDraft === null) {
			return;
		}
		update.mutate(
			{ organizationId, adminTelegramChatId: chatIdDraft.trim() || null },
			{
				onSuccess: () => {
					setChatIdDraft(null);
					toast.success("Admin Telegram chat saved");
				},
			},
		);
	};

	if (isLoading || !data) {
		return (
			<SettingsItem
				title="Stopped Payment Automation"
				description="Control what happens when a collector flags a customer as stopped while taking a payment."
			>
				<div className="flex items-center justify-center py-8">
					<LoaderIcon className="size-6 animate-spin text-muted-foreground" />
				</div>
			</SettingsItem>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsItem
				title="Stopped Payment Automation"
				description="Control what happens when a collector flags a customer as stopped while taking a payment."
			>
				<div className="space-y-6">
					<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
						<div className="flex-1">
							<Label
								htmlFor="stopped-payment-task"
								className="font-medium"
							>
								Create review task
							</Label>
							<p className="text-muted-foreground text-sm">
								Add a "Review stopped payment" task to the tasks
								list for an admin to approve before the customer
								is deactivated.
							</p>
						</div>
						<Switch
							id="stopped-payment-task"
							checked={data.stoppedPaymentTaskEnabled}
							disabled={update.isPending}
							onCheckedChange={(checked) =>
								onToggle("stoppedPaymentTaskEnabled", checked)
							}
						/>
					</div>

					<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
						<div className="flex-1">
							<Label
								htmlFor="stopped-payment-notify"
								className="font-medium"
							>
								Send admin notification
							</Label>
							<p className="text-muted-foreground text-sm">
								Notify admins with a "Stopped Payment Needs
								Review" alert when a stop is flagged.
							</p>
						</div>
						<Switch
							id="stopped-payment-notify"
							checked={data.stoppedPaymentNotifyEnabled}
							disabled={update.isPending}
							onCheckedChange={(checked) =>
								onToggle("stoppedPaymentNotifyEnabled", checked)
							}
						/>
					</div>
				</div>
			</SettingsItem>

			<PaymentRemindersSettings />

			<SettingsItem
				title="Collected bills"
				description="What counts toward each collector's collected bills (the month-end tally). Counts only, never cash. Each collector can override this on their employee page."
			>
				<div className="space-y-6">
					<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
						<div className="flex-1">
							<Label
								htmlFor="collector-counts-free"
								className="font-medium"
							>
								Free bills count as collected
							</Label>
							<p className="text-muted-foreground text-sm">
								A bill the collector marks free counts on the
								collector like a paid one.
							</p>
						</div>
						<Switch
							id="collector-counts-free"
							checked={data.collectorCountsFree}
							disabled={update.isPending}
							onCheckedChange={(checked) =>
								onToggle("collectorCountsFree", checked)
							}
						/>
					</div>

					<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
						<div className="flex-1">
							<Label
								htmlFor="collector-counts-stop"
								className="font-medium"
							>
								Stopped bills count as collected
							</Label>
							<p className="text-muted-foreground text-sm">
								A bill the collector flags as stopped counts on
								the collector like a paid one.
							</p>
						</div>
						<Switch
							id="collector-counts-stop"
							checked={data.collectorCountsStop}
							disabled={update.isPending}
							onCheckedChange={(checked) =>
								onToggle("collectorCountsStop", checked)
							}
						/>
					</div>
				</div>
			</SettingsItem>

			<SettingsItem
				title="Admin Telegram Alerts"
				description="Send a Telegram message to an admin chat when key field events happen. Set the chat ID, then pick which events to be alerted about."
			>
				<div className="space-y-6">
					<div className="space-y-2 rounded-lg border border-border p-4">
						<Label
							htmlFor="admin-telegram-chat"
							className="font-medium"
						>
							Admin Telegram chat ID
						</Label>
						<p className="text-muted-foreground text-sm">
							The numeric chat (or group) ID that receives admin
							alerts. Leave empty to disable all alerts below.
						</p>
						<div className="flex gap-2">
							<Input
								id="admin-telegram-chat"
								value={chatIdValue}
								placeholder="e.g. -1001234567890"
								onChange={(e) => setChatIdDraft(e.target.value)}
							/>
							<Button
								type="button"
								variant="outline"
								disabled={
									update.isPending ||
									chatIdDraft === null ||
									chatIdDraft.trim() === savedChatId
								}
								onClick={saveChatId}
							>
								Save
							</Button>
						</div>
					</div>

					{[
						{
							field: "alertOnWorkerRequest" as const,
							label: "Worker requests a new customer",
							desc: "Alert when a field worker submits a new customer for approval.",
						},
						{
							field: "alertOnPaymentCollected" as const,
							label: "Payment collected",
							desc: "Alert when a collector records a customer payment.",
						},
						{
							field: "alertOnInstallationDone" as const,
							label: "Installation submitted",
							desc: "Alert when a worker submits an installation from the field.",
						},
					].map((row) => (
						<div
							key={row.field}
							className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
						>
							<div className="flex-1">
								<Label
									htmlFor={row.field}
									className="font-medium"
								>
									{row.label}
								</Label>
								<p className="text-muted-foreground text-sm">
									{row.desc}
								</p>
							</div>
							<Switch
								id={row.field}
								checked={data[row.field]}
								disabled={
									update.isPending ||
									!data.adminTelegramChatId
								}
								onCheckedChange={(checked) =>
									onToggle(row.field, checked)
								}
							/>
						</div>
					))}
				</div>
			</SettingsItem>

			<SettingsItem
				title="Worker Task Notifications"
				description="Notify the workers assigned to a task — in-app and on Telegram (for workers who linked their Telegram) — when the task changes."
			>
				<div className="space-y-6">
					{[
						{
							field: "notifyWorkerOnTaskAssigned" as const,
							label: "Task assigned",
							desc: "Notify a worker when a task is assigned to them (on creation or re-assignment).",
						},
						{
							field: "notifyWorkerOnTaskUpdated" as const,
							label: "Task rescheduled or re-prioritized",
							desc: "Notify assigned workers when an active task's due date or priority changes.",
						},
						{
							field: "notifyWorkerOnTaskCancelled" as const,
							label: "Task cancelled",
							desc: "Notify assigned workers when a task they're on is cancelled.",
						},
						{
							field: "notifyWorkerOnTaskReminder" as const,
							label: "Due-time reminder",
							desc: "Remind assigned workers on Telegram before a task with a due time (set a time on the task).",
						},
					].map((row) => (
						<div
							key={row.field}
							className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
						>
							<div className="flex-1">
								<Label
									htmlFor={row.field}
									className="font-medium"
								>
									{row.label}
								</Label>
								<p className="text-muted-foreground text-sm">
									{row.desc}
								</p>
							</div>
							<Switch
								id={row.field}
								checked={data[row.field]}
								disabled={update.isPending}
								onCheckedChange={(checked) =>
									onToggle(row.field, checked)
								}
							/>
						</div>
					))}
					<div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
						<div className="flex-1">
							<Label
								htmlFor="task-reminder-lead"
								className="font-medium"
							>
								Remind this many minutes before
							</Label>
							<p className="text-muted-foreground text-sm">
								Between 5 and 240 minutes. Default 30.
							</p>
						</div>
						<Input
							id="task-reminder-lead"
							type="number"
							min={5}
							max={240}
							className="w-24"
							defaultValue={data.taskReminderLeadMinutes}
							disabled={
								update.isPending ||
								!data.notifyWorkerOnTaskReminder
							}
							onBlur={(e) => {
								const minutes = Number(e.target.value);
								if (
									!organizationId ||
									!Number.isInteger(minutes) ||
									minutes < 5 ||
									minutes > 240 ||
									minutes === data.taskReminderLeadMinutes
								) {
									return;
								}
								update.mutate(
									{
										organizationId,
										taskReminderLeadMinutes: minutes,
									},
									{
										onSuccess: () =>
											toast.success(
												"Reminder time saved",
											),
									},
								);
							}}
						/>
					</div>
				</div>
			</SettingsItem>
		</div>
	);
}
