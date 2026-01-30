import { db } from "@repo/database";

/**
 * Auto-sync event types that can trigger contact syncs.
 */
export type AutoSyncEvent = "contact.created" | "contact.updated";

/**
 * Trigger auto-sync for connections that have the event enabled.
 * This queues background jobs to sync the contact to each matching connection.
 */
export async function triggerAutoSync(params: {
	organizationId: string;
	contactId: string;
	event: AutoSyncEvent;
}): Promise<void> {
	const { organizationId, contactId, event } = params;

	// Find connections with auto-sync enabled for this event
	const connections = await db.integrationConnection.findMany({
		where: {
			organizationId,
			syncMode: "auto",
			autoSyncEvents: { has: event },
			status: "connected",
		},
		select: {
			id: true,
			providerConfigKey: true,
		},
	});

	if (connections.length === 0) {
		return;
	}

	// Import the job queue dynamically to avoid circular dependencies
	const { queueContactSync } = await import("@repo/jobs/integration-sync");

	// Queue sync job for each connection
	for (const connection of connections) {
		await queueContactSync({
			connectionId: connection.id,
			contactIds: [contactId],
			trigger: event,
			type: "push_single",
		});
	}
}

/**
 * Check if there are any auto-sync connections for an organization.
 * Useful for optimizing - skip auto-sync logic if no connections exist.
 */
export async function hasAutoSyncConnections(
	organizationId: string,
): Promise<boolean> {
	const count = await db.integrationConnection.count({
		where: {
			organizationId,
			syncMode: "auto",
			status: "connected",
		},
	});

	return count > 0;
}
