import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

const leadCaptureDef = toolDefinition({
	name: "lead-capture",
	description:
		"Capture contact details (name, email, phone, company, title) from the conversation into the lead database. Use this when the user shares their contact information or when you need to save a networking lead.",
	inputSchema: z.object({
		name: z.string().describe("Contact's full name"),
		email: z
			.string()
			.email()
			.optional()
			.describe("Contact's email address"),
		phone: z.string().optional().describe("Contact's phone number"),
		company: z
			.string()
			.optional()
			.describe("Contact's company or organization"),
		title: z.string().optional().describe("Contact's job title or role"),
		notes: z
			.string()
			.optional()
			.describe("Additional notes about the contact"),
	}),
});

function createLeadCaptureTool(context: ToolContext) {
	return leadCaptureDef.server(async (args) => {
		try {
			const { db } = await import("@repo/database");

			await db.aiCapturedLead.create({
				data: {
					organizationId: context.organizationId,
					agentId: context.agentId,
					conversationId: context.conversationId,
					externalChatId: context.externalChatId,
					name: args.name,
					email: args.email ?? null,
					phone: args.phone ?? null,
					company: args.company ?? null,
					title: args.title ?? null,
					notes: args.notes ?? null,
				},
			});

			return {
				success: true,
				message: `Contact "${args.name}" has been saved to the lead database.`,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to save contact: ${error instanceof Error ? error.message : "Unknown error"}`,
			};
		}
	});
}

export const leadCapture: RegisteredTool = {
	metadata: {
		id: "lead-capture",
		name: "Lead Capture",
		description:
			"Automatically capture contact details from conversations into the lead database",
		category: "networking",
		requiresConfig: false,
	},
	factory: createLeadCaptureTool,
};
