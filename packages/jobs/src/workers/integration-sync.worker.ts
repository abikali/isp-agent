import { db, Prisma } from "@repo/database";
import { getNangoClient } from "@repo/integrations";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { INTEGRATION_SYNC_QUEUE_NAME } from "../queues/integration-sync.queue";
import type {
	IntegrationSyncJobData,
	IntegrationSyncJobResult,
} from "../types";

/**
 * Contact data structure from database.
 */
interface ContactData {
	id: string;
	name: string | null;
	email: string | null;
	phone: string | null;
	company: string | null;
	notes: string | null;
}

/**
 * Contact field mapping for each provider.
 */
const CONTACT_FIELD_MAPPINGS: Record<
	string,
	Record<string, string | ((contact: ContactData) => unknown)>
> = {
	hubspot: {
		firstname: (c) => c.name?.split(" ")[0] || "",
		lastname: (c) => c.name?.split(" ").slice(1).join(" ") || "",
		email: "email",
		phone: "phone",
		company: "company",
	},
	salesforce: {
		FirstName: (c) => c.name?.split(" ")[0] || "",
		LastName: (c) => c.name?.split(" ").slice(1).join(" ") || "Unknown",
		Email: "email",
		Phone: "phone",
		Company: "company",
	},
	"zoho-crm": {
		First_Name: (c) => c.name?.split(" ")[0] || "",
		Last_Name: (c) => c.name?.split(" ").slice(1).join(" ") || "Unknown",
		Email: "email",
		Phone: "phone",
		Account_Name: "company",
	},
	pipedrive: {
		name: "name",
		email: (c) => (c.email ? [{ value: c.email, primary: true }] : []),
		phone: (c) => (c.phone ? [{ value: c.phone, primary: true }] : []),
		org_name: "company",
	},
	freshsales: {
		first_name: (c) => c.name?.split(" ")[0] || "",
		last_name: (c) => c.name?.split(" ").slice(1).join(" ") || "",
		email: "email",
		mobile_number: "phone",
	},
	slack: {
		// Slack sends notifications, not contacts
		text: (c) =>
			`New lead captured: ${c.name || "Unknown"} (${c.email || "No email"})`,
	},
};

/**
 * Map a contact to provider-specific format.
 */
function mapContactToProvider(
	providerKey: string,
	contact: ContactData,
): Record<string, unknown> {
	const mapping = CONTACT_FIELD_MAPPINGS[providerKey];
	if (!mapping) {
		// Default mapping if no specific mapping exists
		return {
			name: contact.name,
			email: contact.email,
			phone: contact.phone,
			company: contact.company,
			notes: contact.notes,
		};
	}

	const result: Record<string, unknown> = {};
	for (const [targetField, sourceOrFn] of Object.entries(mapping)) {
		if (typeof sourceOrFn === "function") {
			result[targetField] = sourceOrFn(contact);
		} else {
			result[targetField] = contact[sourceOrFn as keyof ContactData];
		}
	}

	return result;
}

/**
 * Get the API endpoint for creating contacts in each provider.
 */
function getProviderEndpoint(providerKey: string): {
	method: string;
	path: string;
} {
	const endpoints: Record<string, { method: string; path: string }> = {
		hubspot: { method: "POST", path: "/crm/v3/objects/contacts" },
		salesforce: {
			method: "POST",
			path: "/services/data/v57.0/sobjects/Lead",
		},
		"zoho-crm": { method: "POST", path: "/crm/v2/Contacts" },
		pipedrive: { method: "POST", path: "/v1/persons" },
		freshsales: { method: "POST", path: "/crm/sales/api/contacts" },
		slack: { method: "POST", path: "/api/chat.postMessage" },
	};

	return endpoints[providerKey] || { method: "POST", path: "/contacts" };
}

export function createIntegrationSyncWorker(): Worker<
	IntegrationSyncJobData,
	IntegrationSyncJobResult
> {
	return new Worker<IntegrationSyncJobData, IntegrationSyncJobResult>(
		INTEGRATION_SYNC_QUEUE_NAME,
		async (job: Job<IntegrationSyncJobData>) => {
			const { operationId, connectionId, contactIds } = job.data;

			logger.info(`Processing integration sync job ${job.id}`, {
				operationId,
				connectionId,
				contactCount: contactIds?.length ?? "all",
			});

			// Mark operation as in progress
			await db.contactSyncOperation.update({
				where: { id: operationId },
				data: {
					status: "in_progress",
					startedAt: new Date(),
				},
			});

			try {
				// Get connection details
				const connection = await db.integrationConnection.findUnique({
					where: { id: connectionId },
					select: {
						id: true,
						organizationId: true,
						providerConfigKey: true,
						connectionId: true,
					},
				});

				if (!connection) {
					throw new Error(`Connection not found: ${connectionId}`);
				}

				// Get the shared Nango client (configured for self-hosted or cloud)
				const nango = getNangoClient();

				// Contacts feature removed - return empty array
				const contacts: Array<{
					id: string;
					name: string | null;
					email: string | null;
					phone: string | null;
					company: string | null;
					notes: string | null;
				}> = [];

				let successCount = 0;
				let errorCount = 0;
				const errors: Array<{ contactId: string; error: string }> = [];

				const endpoint = getProviderEndpoint(
					connection.providerConfigKey,
				);

				// Process contacts
				for (const contact of contacts) {
					try {
						const mappedData = mapContactToProvider(
							connection.providerConfigKey,
							contact,
						);

						// Use Nango proxy to push to the provider
						// HubSpot requires data wrapped in "properties" object
						const requestData =
							connection.providerConfigKey === "hubspot"
								? { properties: mappedData }
								: mappedData;

						await nango.proxy({
							providerConfigKey: connection.providerConfigKey,
							connectionId: connection.connectionId,
							method: endpoint.method as
								| "GET"
								| "POST"
								| "PUT"
								| "PATCH"
								| "DELETE",
							endpoint: endpoint.path,
							data: requestData,
						});

						successCount++;
					} catch (error) {
						errorCount++;
						// Extract detailed error info from Nango/Axios errors
						let errorMessage = "Unknown error";
						let errorDetails: Record<string, unknown> = {};

						if (error instanceof Error) {
							errorMessage = error.message;
							// Check for Axios error with response data
							const axiosError = error as {
								response?: { data?: unknown; status?: number };
							};
							if (axiosError.response) {
								errorDetails = {
									status: axiosError.response.status,
									data: axiosError.response.data,
								};
							}
						}

						errors.push({
							contactId: contact.id,
							error: errorMessage,
						});

						logger.warn(`Failed to sync contact ${contact.id}`, {
							error: errorMessage,
							errorDetails,
							provider: connection.providerConfigKey,
							contactData: {
								name: contact.name,
								email: contact.email,
							},
						});
					}
				}

				// Update operation status
				await db.contactSyncOperation.update({
					where: { id: operationId },
					data: {
						status:
							errorCount === 0
								? "completed"
								: "completed_with_errors",
						successCount,
						errorCount,
						errors: errors.length > 0 ? errors : Prisma.JsonNull,
						completedAt: new Date(),
					},
				});

				// Update connection last sync time
				await db.integrationConnection.update({
					where: { id: connectionId },
					data: {
						lastSyncAt: new Date(),
						lastError:
							errorCount > 0
								? `${errorCount} contacts failed`
								: null,
						updatedAt: new Date(),
					},
				});

				logger.info("Integration sync completed", {
					operationId,
					successCount,
					errorCount,
				});

				return {
					success: errorCount === 0,
					operationId,
					successCount,
					errorCount,
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";

				// Update operation with error
				await db.contactSyncOperation.update({
					where: { id: operationId },
					data: {
						status: "failed",
						errors: { message: errorMessage },
						completedAt: new Date(),
					},
				});

				// Update connection status
				await db.integrationConnection.update({
					where: { id: connectionId },
					data: {
						lastError: errorMessage,
						status: "error",
						updatedAt: new Date(),
					},
				});

				logger.error(`Integration sync job ${job.id} failed`, {
					error,
					operationId,
				});

				throw error;
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: 5,
		},
	);
}
