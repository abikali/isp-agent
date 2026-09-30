import { getCustomerNotifyQueue } from "../queues/customer-notify.queue";

/**
 * Queue one send per `CustomerNotification` row (status `queued`).
 * Deduplicated per row, so re-queueing a row that is still waiting or
 * retrying is a no-op; the worker also skips rows no longer `queued`.
 */
export async function queueCustomerNotifications(
	notificationIds: string[],
): Promise<void> {
	if (notificationIds.length === 0) {
		return;
	}
	await getCustomerNotifyQueue().addBulk(
		notificationIds.map((notificationId) => ({
			name: "send",
			data: { notificationId },
			opts: {
				deduplication: { id: `customer-notify:${notificationId}` },
			},
		})),
	);
}
