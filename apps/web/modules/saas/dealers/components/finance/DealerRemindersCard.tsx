"use client";

import {
	ContentCard,
	ContentCardSection,
} from "@shared/components/ContentCard";
import { useOrganizationId } from "@shared/lib/organization";
import { Label } from "@ui/components/label";
import { Switch } from "@ui/components/switch";
import { toast } from "sonner";
import {
	type DealerFinanceLedger,
	useSetDealerReminderGrant,
} from "../../hooks/use-dealer-finance";
import {
	DealerNotificationLimitsForm,
	LIMIT_FIELDS,
} from "./DealerNotificationLimitsForm";

/**
 * Operator-only: grant this dealer's customers the WhatsApp + SMS payment
 * reminders and stop notices. They go out on LibanCom's accounts, so the
 * dealer cannot switch them on itself.
 */
export function DealerRemindersCard({
	dealer,
}: {
	dealer: DealerFinanceLedger["dealer"];
}) {
	const organizationId = useOrganizationId();
	const grant = useSetDealerReminderGrant();
	const reminders = dealer.reminders;

	return (
		<ContentCard>
			<ContentCardSection>
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-1">
						<Label
							htmlFor="dealer-reminders"
							className="font-medium"
						>
							Customer reminders (WhatsApp + SMS)
						</Label>
						<p className="text-muted-foreground text-xs">
							{reminders
								? `Day-before-expiry reminders for unpaid invoices and stop notices, sent from LibanCom's number to ${reminders.organizationName}'s customers.`
								: "This dealer has no LibanCom account, so there is nothing to enable."}
						</p>
					</div>
					<Switch
						id="dealer-reminders"
						checked={reminders?.allowed ?? false}
						disabled={
							!reminders || !organizationId || grant.isPending
						}
						onCheckedChange={(allowed) => {
							if (!organizationId) {
								return;
							}
							grant.mutate(
								{
									organizationId,
									dealerId: dealer.id,
									allowed,
								},
								{
									onSuccess: () =>
										toast.success(
											allowed
												? "Reminders enabled for this dealer"
												: "Reminders disabled for this dealer",
										),
									onError: (error) =>
										toast.error(error.message),
								},
							);
						}}
					/>
				</div>
				{reminders && organizationId && (
					<DealerNotificationLimitsForm
						// Remount with the saved values after a save.
						key={LIMIT_FIELDS.map((f) => reminders[f.name]).join()}
						organizationId={organizationId}
						dealerId={dealer.id}
						reminders={reminders}
					/>
				)}
			</ContentCardSection>
		</ContentCard>
	);
}
