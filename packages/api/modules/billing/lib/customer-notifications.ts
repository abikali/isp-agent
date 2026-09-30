import { db } from "@repo/database";
import { customerNotificationsAllowed } from "@repo/jobs";

/**
 * Whether this org may send customer payment notifications (stop notices,
 * expiry reminders): the operator org always, a dealer org once the operator
 * granted it.
 */
export async function customerNotificationsEnabled(
	organizationId: string,
): Promise<boolean> {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { isWholesaleOperator: true, expiryReminderAllowed: true },
	});
	return org ? customerNotificationsAllowed(org) : false;
}
