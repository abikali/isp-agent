import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { LocationRequestJobData } from "../types";

export const LOCATION_REQUEST_QUEUE_NAME = "location-request";

let queue: Queue<LocationRequestJobData> | null = null;

export function getLocationRequestQueue(): Queue<LocationRequestJobData> {
	if (!queue) {
		queue = new Queue<LocationRequestJobData>(LOCATION_REQUEST_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 2000,
				},
				removeOnComplete: {
					age: 24 * 60 * 60,
					count: 1000,
				},
				removeOnFail: {
					age: 7 * 24 * 60 * 60,
				},
			},
		});
	}
	return queue;
}

export async function closeLocationRequestQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}
