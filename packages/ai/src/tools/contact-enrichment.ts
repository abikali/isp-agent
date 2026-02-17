import { logger } from "@repo/logs";
import { tool } from "ai";
import { z } from "zod";
import type { RegisteredTool, ToolContext } from "./types";

function createContactEnrichmentTool(context: ToolContext) {
	return tool({
		description:
			"Look up and enrich contact information using email address. Supports Clearbit and Apollo APIs. Use this when you have a contact's email and want to find their company, title, social profiles, etc.",
		inputSchema: z.object({
			email: z.string().email().describe("Email address to look up"),
		}),
		execute: async (args) => {
			try {
				const provider =
					(context.toolConfig?.["provider"] as string) ?? "clearbit";
				const apiKey = context.toolConfig?.["apiKey"] as
					| string
					| undefined;

				if (!apiKey) {
					return {
						success: false,
						message:
							"Contact enrichment is not configured. Please set up an API key in the tool settings.",
					};
				}

				if (provider === "apollo") {
					const response = await fetch(
						"https://api.apollo.io/v1/people/match",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"X-Api-Key": apiKey,
							},
							body: JSON.stringify({ email: args.email }),
						},
					);

					if (!response.ok) {
						return {
							success: false,
							message: `Apollo API returned status ${response.status}`,
						};
					}

					const data = (await response.json()) as {
						person?: {
							first_name?: string;
							last_name?: string;
							title?: string;
							organization?: { name?: string };
							linkedin_url?: string;
						};
					};

					if (!data.person) {
						return {
							success: false,
							message: `No information found for ${args.email}`,
						};
					}

					const person = data.person;
					return {
						success: true,
						message: `Found contact: ${person.first_name ?? ""} ${person.last_name ?? ""}, ${person.title ?? "Unknown title"} at ${person.organization?.name ?? "Unknown company"}${person.linkedin_url ? `. LinkedIn: ${person.linkedin_url}` : ""}`,
					};
				}

				// Clearbit (default)
				const response = await fetch(
					`https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(args.email)}`,
					{
						headers: {
							Authorization: `Bearer ${apiKey}`,
						},
					},
				);

				if (!response.ok) {
					if (response.status === 404) {
						return {
							success: false,
							message: `No information found for ${args.email}`,
						};
					}
					return {
						success: false,
						message: `Clearbit API returned status ${response.status}`,
					};
				}

				const data = (await response.json()) as {
					fullName?: string;
					title?: string;
					employment?: { name?: string; title?: string };
					linkedin?: { handle?: string };
				};

				return {
					success: true,
					message: `Found contact: ${data.fullName ?? args.email}, ${data.employment?.title ?? data.title ?? "Unknown title"} at ${data.employment?.name ?? "Unknown company"}${data.linkedin?.handle ? `. LinkedIn: linkedin.com/in/${data.linkedin.handle}` : ""}`,
				};
			} catch (error) {
				logger.error("Contact enrichment failed", {
					error,
					email: args.email,
				});
				return {
					success: false,
					message: `Failed to enrich contact: ${error instanceof Error ? error.message : "Unknown error"}`,
				};
			}
		},
	});
}

export const contactEnrichment: RegisteredTool = {
	metadata: {
		id: "contact-enrichment",
		name: "Contact Enrichment",
		description:
			"Look up contact details using Clearbit or Apollo APIs to enrich lead profiles",
		category: "enrichment",
		requiresConfig: true,
		configFields: [
			{
				key: "provider",
				label: "Provider",
				type: "select",
				required: true,
				options: [
					{ label: "Clearbit", value: "clearbit" },
					{ label: "Apollo", value: "apollo" },
				],
			},
			{
				key: "apiKey",
				label: "API Key",
				type: "password",
				required: true,
				placeholder: "Enter your API key",
			},
		],
	},
	factory: createContactEnrichmentTool,
};
