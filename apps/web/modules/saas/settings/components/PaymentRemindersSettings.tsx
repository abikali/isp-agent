"use client";

import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { Switch } from "@ui/components/switch";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { CustomerNotificationsLog } from "./CustomerNotificationsLog";

/**
 * "Payment reminders" card: the day-before-expiry WhatsApp + SMS to customers
 * with an unpaid invoice, sent daily at 10:00. A dealer org only gets the
 * switches once LibanCom (the operator) granted it.
 */
export function PaymentRemindersSettings() {
	const organizationId = useOrganizationId();
	const queryClient = useQueryClient();

	const { data } = useQuery(
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
		onError: (error) => toast.error(error.message),
	});

	const [phoneDraft, setPhoneDraft] = useState<string | null>(null);

	if (!organizationId || !data) {
		return null;
	}

	const description =
		"Sent daily at 10:00 to customers whose invoice expires tomorrow and is still unpaid, on WhatsApp and SMS, asking them to call their collector.";

	if (!data.expiryReminderAllowed) {
		return (
			<SettingsItem title="Payment Reminders" description={description}>
				<p className="rounded-lg border border-border p-4 text-muted-foreground text-sm">
					Not available for this organization yet. Ask LibanCom to
					enable customer payment reminders.
				</p>
			</SettingsItem>
		);
	}

	const savedPhone = data.reminderFallbackPhone ?? "";
	const phoneValue = phoneDraft ?? savedPhone;
	const run = data.reminderLastRun;

	const toggle = (
		field:
			| "expiryReminderEnabled"
			| "expiryReminderWhatsapp"
			| "expiryReminderSms",
		checked: boolean,
	) => update.mutate({ organizationId, [field]: checked });

	return (
		<SettingsItem title="Payment Reminders" description={description}>
			<div className="space-y-6">
				<div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
					<div className="flex-1">
						<Label
							htmlFor="expiry-reminders"
							className="font-medium"
						>
							Remind customers the day before expiry
						</Label>
						<p className="text-muted-foreground text-sm">
							Only invoices of the open billing month (and older)
							are checked: a customer whose next invoice was not
							generated yet is not reminded, so open next month
							before the 1st.
						</p>
					</div>
					<Switch
						id="expiry-reminders"
						checked={data.expiryReminderEnabled}
						disabled={update.isPending}
						onCheckedChange={(c) =>
							toggle("expiryReminderEnabled", c)
						}
					/>
				</div>

				{[
					{
						field: "expiryReminderWhatsapp" as const,
						label: "WhatsApp",
						desc: "Template payment_reminder_tomorrow from the official LibanCom number.",
					},
					{
						field: "expiryReminderSms" as const,
						label: "SMS",
						desc: "From sender Libancom. Lebanese numbers only.",
					},
				].map((row) => (
					<div
						key={row.field}
						className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
					>
						<div className="flex-1">
							<Label htmlFor={row.field} className="font-medium">
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
								update.isPending || !data.expiryReminderEnabled
							}
							onCheckedChange={(c) => toggle(row.field, c)}
						/>
					</div>
				))}

				<div className="space-y-2 rounded-lg border border-border p-4">
					<Label htmlFor="reminder-fallback" className="font-medium">
						Office phone (fallback)
					</Label>
					<p className="text-muted-foreground text-sm">
						Put in the message when the customer's collector has no
						phone. Without it (and without a dealer phone) those
						customers are skipped.
					</p>
					<div className="flex gap-2">
						<Input
							id="reminder-fallback"
							value={phoneValue}
							placeholder="e.g. 03 775 126"
							onChange={(e) => setPhoneDraft(e.target.value)}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={
								update.isPending ||
								phoneDraft === null ||
								phoneDraft.trim() === savedPhone
							}
							onClick={() =>
								update.mutate(
									{
										organizationId,
										reminderFallbackPhone:
											phoneDraft?.trim() || null,
									},
									{
										onSuccess: () => {
											setPhoneDraft(null);
											toast.success("Office phone saved");
										},
									},
								)
							}
						>
							Save
						</Button>
					</div>
				</div>

				<div className="space-y-3 rounded-lg border border-border p-4">
					<p className="font-medium text-sm">
						{run
							? `Last run ${formatDistanceToNow(new Date(run.at), { addSuffix: true })}: ${run.sent} sent, ${run.failed} failed, ${run.skipped} skipped${run.queued ? `, ${run.queued} sending` : ""}`
							: "No reminders sent yet."}
					</p>
					{run && run.skipReasons.length > 0 && (
						<ul className="list-disc ps-5 text-muted-foreground text-sm">
							{run.skipReasons.map((r) => (
								<li key={r.reason}>
									{r.reason} ×{r.count}
								</li>
							))}
						</ul>
					)}
					<CustomerNotificationsLog />
				</div>
			</div>
		</SettingsItem>
	);
}
