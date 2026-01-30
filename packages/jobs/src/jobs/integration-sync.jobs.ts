import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { getIntegrationSyncQueue } from "../queues/integration-sync.queue";
import type {
	IntegrationSyncOperationType,
	IntegrationSyncTrigger,
} from "../types";

interface QueueContactSyncParams {
	connectionId: string;
	contactIds: string[] | null;
	trigger: IntegrationSyncTrigger;
	type: IntegrationSyncOperationType;
}

/**
 * Queue a contact sync job for an integration connection.
 * Creates a sync operation record and queues the background job.
 * Returns the operation ID for tracking.
 */
export async function queueContactSync(
	params: QueueContactSyncParams,
): Promise<string> {
	const { connectionId, contactIds, trigger, type } = params;

	// Get the connection to find the organization
	const connection = await db.integrationConnection.findUnique({
		where: { id: connectionId },
		select: { id: true, organizationId: true },
	});

	if (!connection) {
		throw new Error(`Connection not found: ${connectionId}`);
	}

	// Determine total contacts
	let totalContacts: number;

	if (contactIds) {
		totalContacts = contactIds.length;
	} else {
		totalContacts = 0;
	}

	// Create sync operation record
	const operation = await db.contactSyncOperation.create({
		data: {
			id: createId(),
			connectionId,
			type,
			trigger,
			status: "pending",
			totalContacts,
		},
	});

	// Queue the job
	const queue = getIntegrationSyncQueue();
	await queue.add(
		`sync-${operation.id}`,
		{
			operationId: operation.id,
			connectionId,
			contactIds,
			trigger,
			type,
		},
		{
			jobId: operation.id,
		},
	);

	return operation.id;
}
