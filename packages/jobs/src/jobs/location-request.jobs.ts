import { getLocationRequestQueue } from "../queues/location-request.queue";
import type { LocationRequestJobData } from "../types";

export async function queueLocationRequest(
	data: LocationRequestJobData,
): Promise<string> {
	const queue = getLocationRequestQueue();
	const job = await queue.add("send-location-request", data);
	return job.id ?? "";
}

/**
 * Enqueue many jobs in a single Redis roundtrip via BullMQ `addBulk`.
 * Prefer this over looping `queueLocationRequest` when the caller has N
 * items to dispatch — sequential awaits add ~2ms each, bulk is one call.
 */
export async function queueLocationRequestsBulk(
	items: readonly LocationRequestJobData[],
): Promise<string[]> {
	if (items.length === 0) {
		return [];
	}
	const queue = getLocationRequestQueue();
	const jobs = await queue.addBulk(
		items.map((data) => ({ name: "send-location-request", data })),
	);
	return jobs.map((job) => job.id ?? "");
}
