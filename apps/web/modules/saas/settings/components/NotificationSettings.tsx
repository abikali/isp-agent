"use client";

import { SettingsItem } from "@saas/shared/components/SettingsItem";
import { disabledQuery, useOrganizationId } from "@shared/lib/organization";
import { orpc } from "@shared/lib/orpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@ui/components/label";
import { Switch } from "@ui/components/switch";
import { LoaderIcon } from "lucide-react";

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
		field: "stoppedPaymentTaskEnabled" | "stoppedPaymentNotifyEnabled",
		checked: boolean,
	) => {
		if (!organizationId) {
			return;
		}
		update.mutate({ organizationId, [field]: checked });
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
							list for an admin to approve before the customer is
							deactivated.
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
							Notify admins with a "Stopped Payment Needs Review"
							alert when a stop is flagged.
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
	);
}
