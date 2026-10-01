"use client";

import { useForm } from "@tanstack/react-form";
import { Button } from "@ui/components/button";
import { Input } from "@ui/components/input";
import { Label } from "@ui/components/label";
import { toast } from "sonner";
import {
	type DealerFinanceLedger,
	useSetDealerNotificationLimits,
} from "../../hooks/use-dealer-finance";

type Reminders = NonNullable<DealerFinanceLedger["dealer"]["reminders"]>;

export const LIMIT_FIELDS = [
	{
		name: "stopNoticeSmsLimit",
		label: "SMS per customer / month",
		placeholder: "No limit",
	},
	{
		name: "stopNoticeWhatsappLimit",
		label: "WhatsApp per customer / month",
		placeholder: "No limit",
	},
	{
		name: "stopNoticeRate",
		label: "Rate per stop notice ($)",
		placeholder: "0",
	},
	{
		name: "expiryReminderRate",
		label: "Rate per daily reminder ($)",
		placeholder: "0",
	},
] as const;

/**
 * How many stop notices ("Notify customer") the dealer may send one customer
 * per month on each channel, and the per-message rates. Empty limit = no
 * limit. The daily reminder is not limited.
 */
export function DealerNotificationLimitsForm({
	organizationId,
	dealerId,
	reminders,
}: {
	organizationId: string;
	dealerId: string;
	reminders: Reminders;
}) {
	const save = useSetDealerNotificationLimits();
	const form = useForm({
		defaultValues: {
			stopNoticeSmsLimit: reminders.stopNoticeSmsLimit?.toString() ?? "",
			stopNoticeWhatsappLimit:
				reminders.stopNoticeWhatsappLimit?.toString() ?? "",
			stopNoticeRate: reminders.stopNoticeRate.toString(),
			expiryReminderRate: reminders.expiryReminderRate.toString(),
		},
		onSubmit: ({ value }) => {
			const limit = (raw: string) =>
				raw.trim() === "" ? null : Math.max(0, Math.floor(Number(raw)));
			const rate = (raw: string) => Math.max(0, Number(raw) || 0);
			save.mutate(
				{
					organizationId,
					dealerId,
					stopNoticeSmsLimit: limit(value.stopNoticeSmsLimit),
					stopNoticeWhatsappLimit: limit(
						value.stopNoticeWhatsappLimit,
					),
					stopNoticeRate: rate(value.stopNoticeRate),
					expiryReminderRate: rate(value.expiryReminderRate),
				},
				{
					onSuccess: () => toast.success("Limits saved"),
					onError: (error) => toast.error(error.message),
				},
			);
		},
	});

	return (
		<form
			className="mt-4 space-y-3 border-border border-t pt-4"
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<div>
				<p className="font-medium text-sm">
					Notify customer limits and rates
				</p>
				<p className="text-muted-foreground text-xs">
					How many times the Notify customer button on a pending stop
					may message one customer per month. Empty = no limit. The
					daily reminder is not limited. Rates are recorded only for
					now.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">
				{LIMIT_FIELDS.map((f) => (
					<form.Field key={f.name} name={f.name}>
						{(field) => (
							<div className="space-y-1">
								<Label htmlFor={`dealer-${f.name}`}>
									{f.label}
								</Label>
								<Input
									id={`dealer-${f.name}`}
									type="number"
									min={0}
									step={f.name.endsWith("Rate") ? "0.01" : 1}
									placeholder={f.placeholder}
									value={field.state.value}
									onChange={(e) =>
										field.handleChange(e.target.value)
									}
								/>
							</div>
						)}
					</form.Field>
				))}
			</div>
			<div className="flex justify-end">
				<Button type="submit" size="sm" disabled={save.isPending}>
					Save limits
				</Button>
			</div>
		</form>
	);
}
