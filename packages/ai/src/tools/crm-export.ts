import { logger } from "@repo/logs";
import { tool } from "ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

function createCrmExportTool(context: ToolContext) {
	return tool({
		description:
			"Export a captured lead to the organization's connected CRM system. Use this when the user wants to push a lead to their CRM or when a new lead has been captured and should be synced.",
		inputSchema: z.object({
			leadId: z
				.string()
				.optional()
				.describe(
					"ID of a previously captured lead to export. If not provided, exports the most recent uncaptured lead.",
				),
		}),
		execute: async (args) => {
			try {
				const { db } = await import("@repo/database");

				// Find the lead to export
				const lead = args.leadId
					? await db.aiCapturedLead.findFirst({
							where: {
								id: args.leadId,
								organizationId: context.organizationId,
							},
						})
					: await db.aiCapturedLead.findFirst({
							where: {
								conversationId: context.conversationId,
								organizationId: context.organizationId,
								exportedToCrm: false,
							},
							orderBy: { createdAt: "desc" },
						});

				if (!lead) {
					return {
						success: false,
						message:
							"No lead found to export. Please capture contact details first.",
					};
				}

				// Check for active CRM integration
				const integration = await db.integrationConnection.findFirst({
					where: {
						organizationId: context.organizationId,
						status: "connected",
						providerConfigKey: {
							in: ["salesforce", "hubspot"],
						},
					},
				});

				if (!integration) {
					return {
						success: false,
						message:
							"No CRM integration is connected. Please connect a CRM in the organization settings.",
					};
				}

				// Create a contact sync operation record
				await db.contactSyncOperation.create({
					data: {
						connectionId: integration.id,
						type: "push_single",
						status: "pending",
						trigger: "ai_agent",
						totalContacts: 1,
						result: {
							source: "ai_agent",
							leadId: lead.id,
							leadName: lead.name,
							leadEmail: lead.email,
							leadPhone: lead.phone,
							leadCompany: lead.company,
						},
					},
				});

				// Mark the lead as exported
				await db.aiCapturedLead.update({
					where: { id: lead.id },
					data: { exportedToCrm: true },
				});

				return {
					success: true,
					message: `Lead "${lead.name}" has been queued for export to ${integration.providerName}. The sync will complete shortly.`,
				};
			} catch (error) {
				logger.error("CRM export failed", {
					error,
					organizationId: context.organizationId,
				});
				return {
					success: false,
					message: `Failed to export lead to CRM: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		},
	});
}

export const crmExport: RegisteredTool = {
	metadata: {
		id: "crm-export",
		name: "CRM Export",
		description:
			"Push captured leads to the connected CRM (Salesforce, HubSpot)",
		category: "crm",
		requiresConfig: false,
	},
	factory: createCrmExportTool,
};
