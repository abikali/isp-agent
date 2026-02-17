import { getWatcherCheckQueue } from "../queues/watcher-check.queue";
import type { WatcherCheckJobData } from "../types";

export async function queueWatcherCheck(
	data: WatcherCheckJobData,
): Promise<void> {
	const queue = getWatcherCheckQueue();
	await queue.add(`watcher-check-${data.watcherId}`, data);
}
